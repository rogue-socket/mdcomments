import * as vscode from "vscode";
import type { ThreadRecord } from "../comments/schema";

interface FileThreads {
  fileUri: vscode.Uri;
  targetFile: string;
  threads: ThreadRecord[];
}

class FileNode extends vscode.TreeItem {
  public readonly key: string;

  constructor(public readonly value: FileThreads) {
    super(value.targetFile, vscode.TreeItemCollapsibleState.Expanded);
    this.key = value.fileUri.toString();
    this.description = `${value.threads.length} thread${value.threads.length === 1 ? "" : "s"}`;
    this.contextValue = "mdcomments.file";
    this.iconPath = new vscode.ThemeIcon("file");
  }
}

class ThreadNode extends vscode.TreeItem {
  public readonly key: string;

  constructor(
    public readonly fileUri: vscode.Uri,
    public readonly thread: ThreadRecord
  ) {
    super(thread.anchor.quote, vscode.TreeItemCollapsibleState.None);
    this.key = `${fileUri.toString()}::${thread.id}`;
    this.tooltip = `${thread.status.toUpperCase()}\n${thread.anchor.quote}`;
    this.description = thread.status;
    this.contextValue = `mdcomments.thread.${thread.status}`;
    this.iconPath = iconForStatus(thread.status);
    this.command = {
      title: "Open Thread",
      command: "mdcomments.openCommentablePreview",
      arguments: [fileUri, thread.id]
    };
  }
}

function iconForStatus(status: ThreadRecord["status"]): vscode.ThemeIcon {
  switch (status) {
    case "resolved":
      return new vscode.ThemeIcon("pass");
    case "orphaned":
      return new vscode.ThemeIcon("warning");
    default:
      return new vscode.ThemeIcon("comment");
  }
}

export class ThreadTreeProvider implements vscode.TreeDataProvider<FileNode | ThreadNode> {
  private readonly entries = new Map<string, FileThreads>();
  private readonly emitter = new vscode.EventEmitter<FileNode | ThreadNode | undefined | void>();

  public readonly onDidChangeTreeData = this.emitter.event;

  public setFileThreads(fileUri: vscode.Uri, targetFile: string, threads: ThreadRecord[]): void {
    const key = fileUri.toString();
    this.entries.set(key, {
      fileUri,
      targetFile,
      threads: [...threads].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    });
    this.emitter.fire();
  }

  public setWorkspaceSidecars(records: Array<{ fileUri: vscode.Uri; targetFile: string; threads: ThreadRecord[] }>): void {
    this.entries.clear();
    for (const record of records) {
      this.entries.set(record.fileUri.toString(), {
        fileUri: record.fileUri,
        targetFile: record.targetFile,
        threads: [...record.threads]
      });
    }
    this.emitter.fire();
  }

  public getAllThreads(): Array<{ fileUri: vscode.Uri; targetFile: string; thread: ThreadRecord }> {
    const results: Array<{ fileUri: vscode.Uri; targetFile: string; thread: ThreadRecord }> = [];
    for (const entry of this.entries.values()) {
      for (const thread of entry.threads) {
        results.push({
          fileUri: entry.fileUri,
          targetFile: entry.targetFile,
          thread
        });
      }
    }
    return results;
  }

  public getTreeItem(element: FileNode | ThreadNode): vscode.TreeItem {
    return element;
  }

  public getChildren(element?: FileNode | ThreadNode): vscode.ProviderResult<Array<FileNode | ThreadNode>> {
    if (!element) {
      return [...this.entries.values()]
        .sort((a, b) => a.targetFile.localeCompare(b.targetFile))
        .map((entry) => new FileNode(entry));
    }

    if (element instanceof FileNode) {
      return element.value.threads
        .slice()
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map((thread) => new ThreadNode(element.value.fileUri, thread));
    }

    return [];
  }
}
