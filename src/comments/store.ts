import { promises as fs } from "node:fs";
import * as crypto from "node:crypto";
import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";
import { createEmptySidecar, parseSidecar, type CommentSidecar } from "./schema";

type StorageMode = "sidecar" | "workspaceTemp";

export class CommentStore {
  constructor(private readonly output: vscode.OutputChannel) {}

  public getSidecarUri(markdownUri: vscode.Uri): vscode.Uri {
    return this.getSidecarUriForMode(markdownUri, this.getStorageMode());
  }

  private getSidecarUriForMode(markdownUri: vscode.Uri, mode: StorageMode): vscode.Uri {
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

  public async readForFile(markdownUri: vscode.Uri): Promise<CommentSidecar> {
    const targetFile = this.workspaceRelativePath(markdownUri);
    const mode = this.getStorageMode();
    const sidecarUri = this.getSidecarUriForMode(markdownUri, mode);
    const fallbackUri = this.getSidecarUriForMode(markdownUri, mode === "sidecar" ? "workspaceTemp" : "sidecar");

    const preferred = await this.readSidecarUri(sidecarUri, targetFile);
    if (preferred) {
      return preferred;
    }

    const fallback = await this.readSidecarUri(fallbackUri, targetFile);
    if (fallback) {
      // If users switch to sidecar mode after using temp mode, migrate automatically.
      if (mode === "sidecar" && sidecarUri.fsPath !== fallbackUri.fsPath) {
        await this.writeSidecarUri(sidecarUri, {
          ...fallback,
          targetFile,
          updatedAt: new Date().toISOString()
        });
        this.output.appendLine(`mdcomments: migrated storage for ${targetFile} from temp to sidecar`);
      }

      return fallback;
    }

    return createEmptySidecar(targetFile);
  }

  public async writeForFile(markdownUri: vscode.Uri, sidecar: CommentSidecar): Promise<CommentSidecar> {
    const targetFile = this.workspaceRelativePath(markdownUri);
    const sidecarUri = this.getSidecarUri(markdownUri);

    const normalized = parseSidecar({
      ...sidecar,
      targetFile,
      updatedAt: new Date().toISOString()
    });

    await this.writeSidecarUri(sidecarUri, normalized);
    return normalized;
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

  public async listAllSidecars(): Promise<Array<{ uri: vscode.Uri; sidecar: CommentSidecar }>> {
    const mode = this.getStorageMode();
    const preferredUris =
      mode === "workspaceTemp"
        ? await this.findTempSidecars()
        : await this.findWorkspaceSidecars();
    const secondaryUris =
      mode === "workspaceTemp"
        ? await this.findWorkspaceSidecars()
        : await this.findTempSidecars();
    const sidecarUris = [...preferredUris, ...secondaryUris];

    const results: Array<{ uri: vscode.Uri; sidecar: CommentSidecar }> = [];
    const seenTargets = new Set<string>();

    for (const uri of sidecarUris) {
      try {
        const content = await fs.readFile(uri.fsPath, "utf8");
        const sidecar = parseSidecar(JSON.parse(content));
        if (seenTargets.has(sidecar.targetFile)) {
          continue;
        }

        seenTargets.add(sidecar.targetFile);
        results.push({ uri, sidecar });
      } catch (error) {
        this.output.appendLine(`mdcomments: Skipping invalid sidecar ${uri.fsPath}. Error: ${String(error)}`);
      }
    }

    return results;
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
    const mode = vscode.workspace.getConfiguration("mdcomments").get<string>("storage.mode", "sidecar");
    return mode === "sidecar" ? "sidecar" : "workspaceTemp";
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
