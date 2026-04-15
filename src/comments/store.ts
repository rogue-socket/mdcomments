import { promises as fs } from "node:fs";
import * as crypto from "node:crypto";
import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";
import { createEmptySidecar, parseSidecar, type CommentSidecar } from "./schema";

type StorageMode = "workspaceState" | "workspaceTemp";
type ReadMode = StorageMode | "sidecar";
const WORKSPACE_STATE_KEY_PREFIX = "mdcomments.sidecar.";

export class CommentStore {
  private didWarnAboutLegacySidecarMode = false;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly output: vscode.OutputChannel
  ) {}

  public getSidecarUri(markdownUri: vscode.Uri): vscode.Uri {
    const mode = this.getStorageMode();
    if (mode === "workspaceState") {
      return this.getWorkspaceStateStorageUri(markdownUri);
    }

    return this.getTempStorageUri(markdownUri);
  }

  private getSidecarUriForMode(markdownUri: vscode.Uri, mode: ReadMode): vscode.Uri {
    if (mode === "workspaceTemp") {
      return this.getTempStorageUri(markdownUri);
    }

    return this.getWorkspaceSidecarUri(markdownUri);
  }

  private getWorkspaceSidecarUri(markdownUri: vscode.Uri): vscode.Uri {
    const directory = path.dirname(markdownUri.fsPath);
    const baseName = path.basename(markdownUri.fsPath, path.extname(markdownUri.fsPath));
    const fileName = `${baseName}.mdcomments.json`;
    return vscode.Uri.file(path.join(directory, fileName));
  }

  private getTempStorageUri(markdownUri: vscode.Uri): vscode.Uri {
    const tempRoot = this.getTempRootDirectory();
    const storageRelativePath = this.getStorageRelativePath(markdownUri);
    return vscode.Uri.file(path.join(tempRoot, `${storageRelativePath}.mdcomments.json`));
  }

  private getWorkspaceStateStorageUri(markdownUri: vscode.Uri): vscode.Uri {
    const key = this.getWorkspaceStateKey(markdownUri);
    return vscode.Uri.parse(`mdcomments-state:/${encodeURIComponent(key)}`);
  }

  public async readForFile(markdownUri: vscode.Uri): Promise<CommentSidecar> {
    const targetFile = this.workspaceRelativePath(markdownUri);
    const mode = this.getStorageMode();
    const fallbackModes = this.getReadModeOrder(mode);

    for (const candidateMode of fallbackModes) {
      const candidate = await this.readFromMode(markdownUri, targetFile, candidateMode);
      if (!candidate) {
        continue;
      }

      if (candidateMode !== mode) {
        await this.writeForMode(markdownUri, {
          ...candidate,
          targetFile,
          updatedAt: new Date().toISOString()
        }, mode);
        this.output.appendLine(`mdcomments: migrated storage for ${targetFile} from ${candidateMode} to ${mode}`);
      }

      return candidate;
    }

    return createEmptySidecar(targetFile);
  }

  public async writeForFile(markdownUri: vscode.Uri, sidecar: CommentSidecar): Promise<CommentSidecar> {
    const targetFile = this.workspaceRelativePath(markdownUri);
    const mode = this.getStorageMode();

    const normalized = parseSidecar({
      ...sidecar,
      targetFile,
      updatedAt: new Date().toISOString()
    });

    await this.writeForMode(markdownUri, normalized, mode);
    return normalized;
  }

  private async readFromMode(
    markdownUri: vscode.Uri,
    targetFile: string,
    mode: ReadMode
  ): Promise<CommentSidecar | null> {
    if (mode === "workspaceState") {
      return this.readWorkspaceState(markdownUri, targetFile);
    }

    const uri = this.getSidecarUriForMode(markdownUri, mode);
    return this.readSidecarUri(uri, targetFile);
  }

  private async writeForMode(markdownUri: vscode.Uri, sidecar: CommentSidecar, mode: StorageMode): Promise<void> {
    if (mode === "workspaceState") {
      await this.writeWorkspaceState(markdownUri, sidecar);
      return;
    }

    const uri = this.getTempStorageUri(markdownUri);
    await this.writeSidecarUri(uri, sidecar);
  }

  private async readSidecarUri(uri: vscode.Uri, targetFile: string): Promise<CommentSidecar | null> {
    if (!(await exists(uri.fsPath))) {
      return null;
    }

    try {
      const content = await fs.readFile(uri.fsPath, "utf8");
      const parsed = parseSidecar(JSON.parse(content));
      return {
        ...parsed,
        targetFile
      };
    } catch (error) {
      await this.backupInvalidFile(uri);
      const message = `mdcomments: Sidecar for ${targetFile} is invalid. A backup was created and an empty store was loaded.`;
      this.output.appendLine(`${message} Error: ${String(error)}`);
      void vscode.window.showWarningMessage(message);
      return null;
    }
  }

  private async writeSidecarUri(sidecarUri: vscode.Uri, sidecar: CommentSidecar): Promise<void> {
    const tempPath = `${sidecarUri.fsPath}.tmp-${Date.now()}`;
    const payload = `${JSON.stringify(sidecar, null, 2)}\n`;

    await fs.mkdir(path.dirname(sidecarUri.fsPath), { recursive: true });
    await fs.writeFile(tempPath, payload, "utf8");
    await fs.rename(tempPath, sidecarUri.fsPath);
  }

  private async readWorkspaceState(markdownUri: vscode.Uri, targetFile: string): Promise<CommentSidecar | null> {
    const key = this.getWorkspaceStateKey(markdownUri);
    const raw = this.context.workspaceState.get<unknown>(key);
    if (raw === undefined) {
      return null;
    }

    try {
      const parsed = parseSidecar(raw);
      return {
        ...parsed,
        targetFile
      };
    } catch (error) {
      await this.context.workspaceState.update(key, undefined);
      const message = `mdcomments: Workspace storage for ${targetFile} is invalid. The entry was reset.`;
      this.output.appendLine(`${message} Error: ${String(error)}`);
      void vscode.window.showWarningMessage(message);
      return null;
    }
  }

  private async writeWorkspaceState(markdownUri: vscode.Uri, sidecar: CommentSidecar): Promise<void> {
    const key = this.getWorkspaceStateKey(markdownUri);
    await this.context.workspaceState.update(key, sidecar);
  }

  public async listAllSidecars(): Promise<Array<{ uri: vscode.Uri; sidecar: CommentSidecar }>> {
    const mode = this.getStorageMode();
    const preferredEntries = await this.listSidecarsForMode(mode);
    const secondaryEntries: Array<{ uri: vscode.Uri; sidecar: CommentSidecar }> = [];

    for (const candidateMode of this.getReadModeOrder(mode)) {
      if (candidateMode === mode) {
        continue;
      }

      const entries = await this.listSidecarsForMode(candidateMode);
      secondaryEntries.push(...entries);
    }

    const sidecarEntries = [...preferredEntries, ...secondaryEntries];

    const results: Array<{ uri: vscode.Uri; sidecar: CommentSidecar }> = [];
    const seenTargets = new Set<string>();

    for (const entry of sidecarEntries) {
      if (seenTargets.has(entry.sidecar.targetFile)) {
        continue;
      }

      seenTargets.add(entry.sidecar.targetFile);
      results.push(entry);
    }

    return results;
  }

  private async listSidecarsForMode(mode: ReadMode): Promise<Array<{ uri: vscode.Uri; sidecar: CommentSidecar }>> {
    if (mode === "workspaceState") {
      return this.listWorkspaceStateSidecars();
    }

    const uris = mode === "workspaceTemp" ? await this.findTempSidecars() : await this.findWorkspaceSidecars();
    const entries: Array<{ uri: vscode.Uri; sidecar: CommentSidecar }> = [];

    for (const uri of uris) {
      try {
        const content = await fs.readFile(uri.fsPath, "utf8");
        const sidecar = parseSidecar(JSON.parse(content));
        entries.push({ uri, sidecar });
      } catch (error) {
        this.output.appendLine(`mdcomments: Skipping invalid sidecar ${uri.fsPath}. Error: ${String(error)}`);
      }
    }

    return entries;
  }

  private async listWorkspaceStateSidecars(): Promise<Array<{ uri: vscode.Uri; sidecar: CommentSidecar }>> {
    const keys = this.context.workspaceState.keys().filter((key) => key.startsWith(WORKSPACE_STATE_KEY_PREFIX));
    const entries: Array<{ uri: vscode.Uri; sidecar: CommentSidecar }> = [];

    for (const key of keys) {
      const raw = this.context.workspaceState.get<unknown>(key);
      if (raw === undefined) {
        continue;
      }

      try {
        const sidecar = parseSidecar(raw);
        const uri = vscode.Uri.parse(`mdcomments-state:/${encodeURIComponent(key)}`);
        entries.push({ uri, sidecar });
      } catch (error) {
        await this.context.workspaceState.update(key, undefined);
        this.output.appendLine(`mdcomments: Skipping invalid workspace storage ${key}. Error: ${String(error)}`);
      }
    }

    return entries;
  }

  private workspaceRelativePath(uri: vscode.Uri): string {
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    if (!folder) {
      return uri.fsPath;
    }

    return path.relative(folder.uri.fsPath, uri.fsPath).replace(/\\/g, "/");
  }

  private async backupInvalidFile(uri: vscode.Uri): Promise<void> {
    const backupPath = `${uri.fsPath}.invalid.${Date.now()}.bak`;
    if (await exists(uri.fsPath)) {
      await fs.copyFile(uri.fsPath, backupPath);
    }
  }

  private getStorageMode(): StorageMode {
    const mode = vscode.workspace.getConfiguration("mdcomments").get<string>("storage.mode", "workspaceState");
    if (mode === "workspaceTemp" || mode === "workspaceState") {
      return mode;
    }

    if (mode === "sidecar" && !this.didWarnAboutLegacySidecarMode) {
      this.didWarnAboutLegacySidecarMode = true;
      this.output.appendLine(
        "mdcomments: storage.mode=sidecar is deprecated and treated as workspaceState to avoid repository-visible files"
      );
    }

    return "workspaceState";
  }

  private getReadModeOrder(mode: StorageMode): ReadMode[] {
    if (mode === "workspaceState") {
      return ["workspaceState", "workspaceTemp", "sidecar"];
    }

    return ["workspaceTemp", "workspaceState", "sidecar"];
  }

  private async findWorkspaceSidecars(): Promise<vscode.Uri[]> {
    return vscode.workspace.findFiles("**/*.mdcomments.json", "**/{node_modules,.git,out}/**");
  }

  private getTempRootDirectory(): string {
    const workspaceFingerprint = (vscode.workspace.workspaceFolders ?? [])
      .map((folder) => folder.uri.fsPath)
      .sort()
      .join("|");

    const key = workspaceFingerprint || "no-workspace";
    const hash = crypto.createHash("sha1").update(key).digest("hex").slice(0, 12);
    return path.join(os.tmpdir(), "mdcomments", hash);
  }

  private getStorageRelativePath(markdownUri: vscode.Uri): string {
    const folder = vscode.workspace.getWorkspaceFolder(markdownUri);
    if (folder) {
      const relative = path.relative(folder.uri.fsPath, markdownUri.fsPath).replace(/\\/g, "/");
      return sanitizeRelativePath(relative);
    }

    const name = path.basename(markdownUri.fsPath);
    const hash = crypto.createHash("sha1").update(markdownUri.fsPath).digest("hex").slice(0, 8);
    return path.join("external", `${hash}-${name}`);
  }

  private getWorkspaceStateKey(markdownUri: vscode.Uri): string {
    const identity = this.getStorageIdentity(markdownUri);
    const hash = crypto.createHash("sha1").update(identity).digest("hex");
    return `${WORKSPACE_STATE_KEY_PREFIX}${hash}`;
  }

  private getStorageIdentity(markdownUri: vscode.Uri): string {
    const folder = vscode.workspace.getWorkspaceFolder(markdownUri);
    if (folder) {
      const relative = path.relative(folder.uri.fsPath, markdownUri.fsPath).replace(/\\/g, "/");
      return `workspace:${folder.uri.toString()}::${relative}`;
    }

    return `external:${markdownUri.toString()}`;
  }

  private async findTempSidecars(): Promise<vscode.Uri[]> {
    const root = this.getTempRootDirectory();
    if (!(await exists(root))) {
      return [];
    }

    const files = await listFilesRecursively(root);
    return files.filter((filePath) => filePath.endsWith(".mdcomments.json")).map((filePath) => vscode.Uri.file(filePath));
  }
}

function sanitizeRelativePath(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, "/");
  const segments = normalized
    .split("/")
    .filter((segment) => segment && segment !== "." && segment !== "..")
    .map((segment) => segment.replace(/[:*?"<>|]/g, "_"));

  if (segments.length === 0) {
    return "document.md";
  }

  return path.join(...segments);
}

async function listFilesRecursively(directory: string): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = await listFilesRecursively(fullPath);
      files.push(...nested);
      continue;
    }

    if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

async function exists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}
