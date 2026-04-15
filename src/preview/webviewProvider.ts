import * as path from "node:path";
import * as vscode from "vscode";
import MarkdownIt from "markdown-it";
import { v4 as uuidv4 } from "uuid";
import { stringifyUnresolvedContext } from "../ai/contextExporter";
import { buildAnchorFromQuote, reanchorThread } from "../comments/anchorEngine";
import { CommentStore } from "../comments/store";
import type { CommentSidecar, Priority, ThreadRecord } from "../comments/schema";
import { ThreadTreeProvider } from "../views/threadTreeProvider";

type HostMessage =
  | { type: "requestState" }
  | { type: "createThread"; payload: { quote: string; body: string; tags?: string[]; priority?: Priority } }
  | { type: "replyToThread"; payload: { threadId: string; body: string } }
  | { type: "editComment"; payload: { threadId: string; commentId: string; body: string } }
  | { type: "resolveThread"; payload: { threadId: string } }
  | { type: "reopenThread"; payload: { threadId: string } }
  | { type: "deleteThread"; payload: { threadId: string } }
  | { type: "deleteComment"; payload: { threadId: string; commentId: string } }
  | { type: "focusThread"; payload: { threadId: string } }
  | { type: "copyContext" }
  | { type: "refresh" };

export class CommentablePreviewController {
  private panel: vscode.WebviewPanel | undefined;
  private currentFileUri: vscode.Uri | undefined;
  private readonly markdownIt: MarkdownIt;
  private lastDecoratedFileUri: vscode.Uri | undefined;
  private readonly openThreadDecoration: vscode.TextEditorDecorationType;
  private readonly orphanedThreadDecoration: vscode.TextEditorDecorationType;
  private readonly resolvedThreadDecoration: vscode.TextEditorDecorationType;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly store: CommentStore,
    private readonly threadTreeProvider: ThreadTreeProvider
  ) {
    this.markdownIt = new MarkdownIt({
      html: false,
      linkify: true,
      typographer: false
    });

    this.openThreadDecoration = vscode.window.createTextEditorDecorationType({
      overviewRulerColor: "#5da9ffcc",
      overviewRulerLane: vscode.OverviewRulerLane.Right,
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
    });
    this.orphanedThreadDecoration = vscode.window.createTextEditorDecorationType({
      overviewRulerColor: "#f6b26bcc",
      overviewRulerLane: vscode.OverviewRulerLane.Right,
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
    });
    this.resolvedThreadDecoration = vscode.window.createTextEditorDecorationType({
      overviewRulerColor: "#8690a4aa",
      overviewRulerLane: vscode.OverviewRulerLane.Right,
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
    });

    this.context.subscriptions.push(
      this.openThreadDecoration,
      this.orphanedThreadDecoration,
      this.resolvedThreadDecoration
    );
  }

  public getCurrentFileUri(): vscode.Uri | undefined {
    return this.currentFileUri;
  }

  public async open(targetUri?: vscode.Uri, focusThreadId?: string): Promise<void> {
    const resolved = await this.resolveMarkdownUri(targetUri);
    if (!resolved) {
      return;
    }

    this.currentFileUri = resolved;

    if (!this.panel) {
      this.panel = this.createPanel();
    } else {
      this.panel.reveal(vscode.ViewColumn.Beside, true);
    }

    this.panel.title = `mdcomments: ${path.basename(resolved.fsPath)}`;
    await this.refresh(focusThreadId);
  }

  public async triggerAddFromSelection(): Promise<void> {
    if (!this.panel) {
      await this.open();
    }

    if (!this.panel) {
      return;
    }

    await this.panel.webview.postMessage({ type: "triggerAddFromSelection" });
  }

  public async toggleThreadStatus(fileUri: vscode.Uri, threadId: string): Promise<void> {
    await this.updateFileSidecar(fileUri, (sidecar) => {
      const thread = sidecar.threads.find((entry) => entry.id === threadId);
      if (!thread) {
        return false;
      }

      applyResolvedState(thread, thread.status !== "resolved");

      return true;
    });

    if (this.currentFileUri?.toString() === fileUri.toString()) {
      await this.refresh(threadId);
    }
  }

  public async getThreadsForFile(fileUri: vscode.Uri): Promise<ThreadRecord[]> {
    const sidecar = await this.store.readForFile(fileUri);
    return sidecar.threads;
  }

  public async refreshWorkspaceThreads(): Promise<void> {
    const entries = await this.store.listAllSidecars();
    const mapped: Array<{ fileUri: vscode.Uri; targetFile: string; threads: ThreadRecord[] }> = [];

    for (const entry of entries) {
      const targetUri = this.resolveTargetUriFromSidecar(entry.sidecar.targetFile);
      if (!targetUri) {
        continue;
      }

      mapped.push({
        fileUri: targetUri,
        targetFile: entry.sidecar.targetFile,
        threads: entry.sidecar.threads
      });
    }

    this.threadTreeProvider.setWorkspaceSidecars(mapped);
  }

  private createPanel(): vscode.WebviewPanel {
    const panel = vscode.window.createWebviewPanel(
      "mdcomments.preview",
      "mdcomments",
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "media")]
      }
    );

    panel.webview.html = this.getHtml(panel.webview);
    panel.webview.onDidReceiveMessage((message) => {
      void this.handleMessage(message as HostMessage);
    });

    panel.onDidDispose(() => {
      if (this.currentFileUri) {
        this.clearOverviewRulerDecorationsForUri(this.currentFileUri);
      }
      this.panel = undefined;
      this.currentFileUri = undefined;
    });

    return panel;
  }

  private async handleMessage(message: HostMessage): Promise<void> {
    switch (message.type) {
      case "requestState":
      case "refresh":
        await this.refresh();
        return;
      case "createThread":
        await this.createThread(message.payload.quote, message.payload.body, message.payload.tags, message.payload.priority);
        return;
      case "replyToThread":
        await this.replyToThread(message.payload.threadId, message.payload.body);
        return;
      case "editComment":
        await this.editComment(message.payload.threadId, message.payload.commentId, message.payload.body);
        return;
      case "resolveThread":
        await this.setThreadResolvedState(message.payload.threadId, true);
        return;
      case "reopenThread":
        await this.setThreadResolvedState(message.payload.threadId, false);
        return;
      case "deleteThread":
        await this.deleteThread(message.payload.threadId);
        return;
      case "deleteComment":
        await this.deleteComment(message.payload.threadId, message.payload.commentId);
        return;
      case "focusThread":
        await this.refresh(message.payload.threadId);
        return;
      case "copyContext":
        await this.copyCurrentFileContext();
        return;
      default:
        return;
    }
  }

  private async copyCurrentFileContext(): Promise<void> {
    if (!this.currentFileUri || !this.panel) {
      return;
    }

    const sidecar = await this.store.readForFile(this.currentFileUri);
    const payload = stringifyUnresolvedContext([sidecar]);
    await vscode.env.clipboard.writeText(payload);
    await this.panel.webview.postMessage({
      type: "notify",
      payload: {
        message: "Unresolved context copied"
      }
    });
  }

  private async createThread(
    quoteRaw: string,
    bodyRaw: string,
    tags: string[] = [],
    priority?: Priority
  ): Promise<void> {
    const fileUri = this.currentFileUri;
    if (!fileUri) {
      return;
    }

    const body = sanitizeBody(bodyRaw);
    const quote = quoteRaw.trim();
    if (!body || !quote) {
      return;
    }

    let createdAsOrphaned = false;

    await this.updateFileSidecar(fileUri, async (sidecar, documentText) => {
      const anchor = buildAnchorFromQuote(documentText, quote) ?? createUnanchoredAnchor(quote, documentText.length);
      const status: ThreadRecord["status"] =
        anchor.currentStart === null || anchor.currentEnd === null ? "orphaned" : "open";
      createdAsOrphaned = status === "orphaned";

      sidecar.threads.push({
        id: `thr_${uuidv4()}`,
        status,
        anchor,
        createdBy: getAuthor(),
        createdAt: new Date().toISOString(),
        resolvedAt: null,
        comments: [
          {
            id: `c_${uuidv4()}`,
            author: getAuthor(),
            body,
            createdAt: new Date().toISOString(),
            editedAt: null
          }
        ],
        tags: tags.filter(Boolean),
        priority
      });

      return true;
    });

    if (createdAsOrphaned) {
      void vscode.window.showWarningMessage(
        "mdcomments: Comment saved, but the exact markdown anchor could not be resolved. Thread marked orphaned."
      );
    }

    await this.refresh();
  }

  private async replyToThread(threadId: string, bodyRaw: string): Promise<void> {
    const fileUri = this.currentFileUri;
    if (!fileUri) {
      return;
    }

    const body = sanitizeBody(bodyRaw);
    if (!body) {
      return;
    }

    await this.updateFileSidecar(fileUri, (sidecar) => {
      const thread = sidecar.threads.find((entry) => entry.id === threadId);
      if (!thread) {
        return false;
      }

      thread.comments.push({
        id: `c_${uuidv4()}`,
        author: getAuthor(),
        body,
        createdAt: new Date().toISOString(),
        editedAt: null
      });
      return true;
    });

    await this.refresh();
  }

  private async editComment(threadId: string, commentId: string, bodyRaw: string): Promise<void> {
    const fileUri = this.currentFileUri;
    if (!fileUri) {
      return;
    }

    const body = sanitizeBody(bodyRaw);
    if (!body) {
      return;
    }

    await this.updateFileSidecar(fileUri, (sidecar) => {
      const thread = sidecar.threads.find((entry) => entry.id === threadId);
      if (!thread) {
        return false;
      }

      const comment = thread.comments.find((entry) => entry.id === commentId);
      if (!comment) {
        return false;
      }

      comment.body = body;
      comment.editedAt = new Date().toISOString();
      return true;
    });

    await this.refresh();
  }

  private async setThreadResolvedState(threadId: string, resolved: boolean): Promise<void> {
    const fileUri = this.currentFileUri;
    if (!fileUri) {
      return;
    }

    await this.updateFileSidecar(fileUri, (sidecar) => {
      const thread = sidecar.threads.find((entry) => entry.id === threadId);
      if (!thread) {
        return false;
      }

      applyResolvedState(thread, resolved);

      return true;
    });

    await this.refresh(threadId);
  }

  private async deleteThread(threadId: string): Promise<void> {
    const fileUri = this.currentFileUri;
    if (!fileUri) {
      return;
    }

    await this.updateFileSidecar(fileUri, (sidecar) => {
      const before = sidecar.threads.length;
      sidecar.threads = sidecar.threads.filter((entry) => entry.id !== threadId);
      return sidecar.threads.length !== before;
    });

    await this.refresh();
  }

  private async deleteComment(threadId: string, commentId: string): Promise<void> {
    const fileUri = this.currentFileUri;
    if (!fileUri) {
      return;
    }

    await this.updateFileSidecar(fileUri, (sidecar) => {
      const thread = sidecar.threads.find((entry) => entry.id === threadId);
      if (!thread) {
        return false;
      }

      const before = thread.comments.length;
      thread.comments = thread.comments.filter((comment) => comment.id !== commentId);

      if (thread.comments.length === 0) {
        sidecar.threads = sidecar.threads.filter((entry) => entry.id !== threadId);
      }

      return thread.comments.length !== before;
    });

    await this.refresh();
  }

  private async refresh(focusThreadId?: string): Promise<void> {
    if (!this.panel || !this.currentFileUri) {
      return;
    }

    const document = await vscode.workspace.openTextDocument(this.currentFileUri);
    const sidecar = await this.store.readForFile(this.currentFileUri);
    const source = document.getText();

    const reanchored = applyReanchor(source, sidecar);
    const activeSidecar = reanchored.changed
      ? await this.store.writeForFile(this.currentFileUri, reanchored.sidecar)
      : reanchored.sidecar;

    this.threadTreeProvider.setFileThreads(this.currentFileUri, activeSidecar.targetFile, activeSidecar.threads);

    const config = vscode.workspace.getConfiguration("mdcomments");
    const showResolved = config.get<boolean>("showResolved", true);
    const visibleThreads = showResolved
      ? activeSidecar.threads
      : activeSidecar.threads.filter((thread) => thread.status !== "resolved");

    this.applyOverviewRulerDecorations(document, activeSidecar.threads, showResolved);

    await this.panel.webview.postMessage({
      type: "setState",
      payload: {
        targetFile: activeSidecar.targetFile,
        renderedHtml: this.markdownIt.render(source),
        threads: visibleThreads,
        showResolved,
        focusThreadId: focusThreadId ?? null
      }
    });
  }

  private async updateFileSidecar(
    fileUri: vscode.Uri,
    mutator: (sidecar: CommentSidecar, documentText: string) => boolean | Promise<boolean>
  ): Promise<void> {
    const document = await vscode.workspace.openTextDocument(fileUri);
    const sidecar = await this.store.readForFile(fileUri);
    const didChange = await mutator(sidecar, document.getText());

    if (didChange) {
      await this.store.writeForFile(fileUri, sidecar);
      this.threadTreeProvider.setFileThreads(fileUri, sidecar.targetFile, sidecar.threads);
    }
  }

  private async resolveMarkdownUri(inputUri?: vscode.Uri): Promise<vscode.Uri | undefined> {
    if (inputUri && isMarkdownUri(inputUri)) {
      return inputUri;
    }

    const activeUri = vscode.window.activeTextEditor?.document.uri;
    if (activeUri && isMarkdownUri(activeUri)) {
      return activeUri;
    }

    if (inputUri && !isMarkdownUri(inputUri)) {
      void vscode.window.showInformationMessage("mdcomments is enabled only for .md files");
      return undefined;
    }

    const markdownDocs = await vscode.workspace.findFiles("**/*.md", "**/{node_modules,.git,out}/**", 1);
    if (markdownDocs.length > 0) {
      return markdownDocs[0];
    }

    void vscode.window.showInformationMessage("mdcomments: open a markdown file to continue");
    return undefined;
  }

  private resolveTargetUriFromSidecar(targetFile: string): vscode.Uri | undefined {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return undefined;
    }

    const candidate = vscode.Uri.joinPath(workspaceFolder.uri, targetFile);
    return candidate;
  }

  private applyOverviewRulerDecorations(
    document: vscode.TextDocument,
    threads: ThreadRecord[],
    showResolved: boolean
  ): void {
    if (this.lastDecoratedFileUri && this.lastDecoratedFileUri.toString() !== document.uri.toString()) {
      this.clearOverviewRulerDecorationsForUri(this.lastDecoratedFileUri);
    }
    this.lastDecoratedFileUri = document.uri;

    const targetThreads = showResolved ? threads : threads.filter((thread) => thread.status !== "resolved");
    const openOptions: vscode.DecorationOptions[] = [];
    const orphanedOptions: vscode.DecorationOptions[] = [];
    const resolvedOptions: vscode.DecorationOptions[] = [];

    for (const thread of targetThreads) {
      const option = this.toOverviewDecorationOption(document, thread);
      if (!option) {
        continue;
      }

      if (thread.status === "orphaned") {
        orphanedOptions.push(option);
        continue;
      }

      if (thread.status === "resolved") {
        resolvedOptions.push(option);
        continue;
      }

      openOptions.push(option);
    }

    for (const editor of vscode.window.visibleTextEditors) {
      if (editor.document.uri.toString() !== document.uri.toString()) {
        continue;
      }

      editor.setDecorations(this.openThreadDecoration, openOptions);
      editor.setDecorations(this.orphanedThreadDecoration, orphanedOptions);
      editor.setDecorations(this.resolvedThreadDecoration, resolvedOptions);
    }
  }

  private clearOverviewRulerDecorationsForUri(uri: vscode.Uri): void {
    for (const editor of vscode.window.visibleTextEditors) {
      if (editor.document.uri.toString() !== uri.toString()) {
        continue;
      }

      editor.setDecorations(this.openThreadDecoration, []);
      editor.setDecorations(this.orphanedThreadDecoration, []);
      editor.setDecorations(this.resolvedThreadDecoration, []);
    }
  }

  private toOverviewDecorationOption(
    document: vscode.TextDocument,
    thread: ThreadRecord
  ): vscode.DecorationOptions | undefined {
    const documentLength = document.getText().length;
    let start = thread.anchor.currentStart ?? thread.anchor.startHint;
    let end = thread.anchor.currentEnd ?? thread.anchor.endHint;

    start = clampNumber(start, 0, documentLength);
    end = clampNumber(end, 0, documentLength);

    if (end <= start) {
      end = Math.min(documentLength, start + 1);
    }

    const range = new vscode.Range(document.positionAt(start), document.positionAt(end));
    const latestComment = thread.comments[thread.comments.length - 1];
    const hoverLines = [
      `Status: ${thread.status}`,
      `Quote: ${thread.anchor.quote}`
    ];

    if (latestComment) {
      hoverLines.push(`Latest: ${latestComment.author}: ${latestComment.body}`);
    }

    return {
      range,
      hoverMessage: new vscode.MarkdownString(hoverLines.map((line) => escapeMarkdown(line)).join("  \n"))
    };
  }

  private getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "media", "preview.js"));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "media", "preview.css"));
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; img-src ${webview.cspSource} https: data:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';"
    />
    <link rel="stylesheet" href="${styleUri}" />
    <title>mdcomments</title>
  </head>
  <body>
    <div class="shell">
      <header class="toolbar">
        <div class="toolbar-left">
          <span class="toolbar-title">mdcomments</span>
          <span id="target-file"></span>
        </div>
        <div class="toolbar-actions">
        <button id="copy-context" type="button">Copy Context JSON</button>
        <button id="refresh" type="button">Refresh</button>
        </div>
      </header>
      <main class="layout">
        <section class="preview-pane">
          <div id="preview-content" aria-label="Markdown preview"></div>
          <div id="selection-actions" class="selection-actions hidden" role="toolbar" aria-label="Selection actions">
            <button id="selection-add-comment" type="button">Add comment</button>
          </div>
          <div id="selection-overlay" class="selection-overlay hidden" role="dialog" aria-label="Comments for selection"></div>
          <div id="hover-overlay" class="hover-overlay hidden" role="dialog" aria-label="Thread preview"></div>
        </section>
        <aside class="thread-pane">
          <div class="thread-pane-header">
            <h2>Threads</h2>
            <span id="thread-summary"></span>
          </div>
          <div id="thread-list"></div>
        </aside>
      </main>
    </div>

    <div id="composer" class="composer hidden" role="dialog" aria-modal="true" aria-label="Create comment">
      <h3>New Comment</h3>
      <p id="composer-quote"></p>
      <textarea id="composer-body" rows="4" placeholder="Describe the requested change"></textarea>
      <div class="composer-actions">
        <button id="composer-cancel" type="button">Cancel</button>
        <button id="composer-submit" type="button">Create Thread</button>
      </div>
    </div>

    <div id="toast" role="status" aria-live="polite"></div>

    <script nonce="${nonce}" src="${scriptUri}"></script>
  </body>
</html>`;
  }
}

function sanitizeBody(input: string): string {
  return input.trim();
}

function getAuthor(): string {
  const user = process.env.USER ?? process.env.LOGNAME;
  if (!user) {
    return "local-user";
  }

  return user;
}

function isMarkdownUri(uri: vscode.Uri): boolean {
  return uri.fsPath.toLowerCase().endsWith(".md");
}

function applyReanchor(source: string, sidecar: CommentSidecar): { sidecar: CommentSidecar; changed: boolean } {
  let changed = false;
  const nextThreads = sidecar.threads.map((thread) => {
    const result = reanchorThread(source, thread);
    changed = changed || result.changed;
    return result.thread;
  });

  if (!changed) {
    return { sidecar, changed: false };
  }

  return {
    changed: true,
    sidecar: {
      ...sidecar,
      threads: nextThreads
    }
  };
}

function getNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let value = "";
  for (let i = 0; i < 32; i += 1) {
    value += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return value;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function escapeMarkdown(input: string): string {
  return input
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/`/g, "\\`")
    .replace(/\*/g, "\\*")
    .replace(/_/g, "\\_")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}

function applyResolvedState(thread: ThreadRecord, resolved: boolean): void {
  if (resolved) {
    thread.status = "resolved";
    thread.resolvedAt = new Date().toISOString();
    return;
  }

  thread.status = "open";
  thread.resolvedAt = null;
}

function createUnanchoredAnchor(quote: string, sourceLength: number): ThreadRecord["anchor"] {
  const boundedEnd = Math.max(0, Math.min(sourceLength, quote.length));
  return {
    quote,
    prefix: "",
    suffix: "",
    startHint: 0,
    endHint: boundedEnd,
    currentStart: null,
    currentEnd: null
  };
}
