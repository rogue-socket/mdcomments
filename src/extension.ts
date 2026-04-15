import * as path from "node:path";
import * as vscode from "vscode";
import { stringifyUnresolvedContext } from "./ai/contextExporter";
import { CommentStore } from "./comments/store";
import { CommentablePreviewController } from "./preview/webviewProvider";
import { ThreadTreeProvider } from "./views/threadTreeProvider";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const output = vscode.window.createOutputChannel("mdcomments");
  context.subscriptions.push(output);

  const store = new CommentStore(output);
  const threadTreeProvider = new ThreadTreeProvider();
  const previewController = new CommentablePreviewController(context, store, threadTreeProvider);

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("mdcomments.threads", threadTreeProvider)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("mdcomments.openCommentablePreview", async (uri?: vscode.Uri, threadId?: string) => {
      const targetUri = resolveMarkdownTargetUri(uri, previewController);
      if (!targetUri) {
        return;
      }

      await previewController.open(targetUri, threadId);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("mdcomments.addCommentFromSelection", async () => {
      const targetUri = resolveMarkdownTargetUri(undefined, previewController);
      if (!targetUri) {
        return;
      }

      await previewController.open(targetUri);
      await previewController.triggerAddFromSelection();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("mdcomments.showThreads", async () => {
      const targetUri = resolveMarkdownTargetUri(undefined, previewController);
      if (!targetUri) {
        return;
      }

      const threads = await previewController.getThreadsForFile(targetUri);
      if (threads.length === 0) {
        void vscode.window.showInformationMessage("mdcomments: no threads for this markdown file");
        return;
      }

      const picks = threads.map((thread) => ({
        label: thread.anchor.quote,
        description: `${thread.status} (${thread.comments.length} comments)`,
        detail: `Created ${new Date(thread.createdAt).toLocaleString()}`,
        threadId: thread.id
      }));

      const selected = await vscode.window.showQuickPick(picks, {
        title: `Threads in ${path.basename(targetUri.fsPath)}`,
        placeHolder: "Select a thread to focus"
      });

      if (!selected) {
        return;
      }

      await previewController.open(targetUri, selected.threadId);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("mdcomments.resolveThread", async (uri?: vscode.Uri, threadId?: string) => {
      const targetUri = resolveMarkdownTargetUri(uri, previewController);
      if (!targetUri) {
        return;
      }

      const toggleAndOpen = async (id: string): Promise<void> => {
        await previewController.toggleThreadStatus(targetUri, id);
        await previewController.open(targetUri, id);
      };

      if (threadId) {
        await toggleAndOpen(threadId);
        return;
      }

      const threads = await previewController.getThreadsForFile(targetUri);
      if (threads.length === 0) {
        void vscode.window.showInformationMessage("mdcomments: no threads to resolve or reopen");
        return;
      }

      const picks = threads.map((thread) => ({
        label: thread.anchor.quote,
        description: `${thread.status} (${thread.id})`,
        threadId: thread.id
      }));

      const selected = await vscode.window.showQuickPick(picks, {
        title: "Resolve or reopen thread",
        placeHolder: "Select a thread"
      });

      if (!selected) {
        return;
      }

      await toggleAndOpen(selected.threadId);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("mdcomments.copyUnresolvedContext", async () => {
      const sidecars = await store.listAllSidecars();
      const unresolvedContext = stringifyUnresolvedContext(sidecars.map((entry) => entry.sidecar));
      await vscode.env.clipboard.writeText(unresolvedContext);
      void vscode.window.showInformationMessage("mdcomments: unresolved context copied to clipboard");
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async (document) => {
      if (!isMarkdown(document.uri)) {
        return;
      }

      if (previewController.getCurrentFileUri()?.toString() === document.uri.toString()) {
        await previewController.open(document.uri);
      }

      await previewController.refreshWorkspaceThreads();
    })
  );

  await previewController.refreshWorkspaceThreads();
  output.appendLine("mdcomments activated");
}

export function deactivate(): void {}

function resolveTargetUri(
  candidate: vscode.Uri | undefined,
  controller: CommentablePreviewController
): vscode.Uri | undefined {
  if (candidate) {
    return candidate;
  }

  const active = vscode.window.activeTextEditor?.document.uri;
  if (active) {
    return active;
  }

  return controller.getCurrentFileUri();
}

function resolveMarkdownTargetUri(
  candidate: vscode.Uri | undefined,
  controller: CommentablePreviewController
): vscode.Uri | undefined {
  const targetUri = resolveTargetUri(candidate, controller);
  if (!targetUri || !isMarkdown(targetUri)) {
    void vscode.window.showInformationMessage("mdcomments is enabled only for .md files");
    return undefined;
  }

  return targetUri;
}

function isMarkdown(uri: vscode.Uri): boolean {
  return uri.fsPath.toLowerCase().endsWith(".md");
}
