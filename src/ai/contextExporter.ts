import type { CommentSidecar, ThreadRecord } from "../comments/schema";

export interface UnresolvedContextPayload {
  version: number;
  generatedAt: string;
  entries: Array<{
    file: string;
    threadId: string;
    status: "open" | "orphaned";
    quote: string;
    priority?: "low" | "medium" | "high";
    tags: string[];
    comments: Array<{
      author: string;
      body: string;
    }>;
  }>;
}

function isUnresolved(thread: ThreadRecord): thread is ThreadRecord & { status: "open" | "orphaned" } {
  return thread.status === "open" || thread.status === "orphaned";
}

export function buildUnresolvedContext(sidecars: CommentSidecar[]): UnresolvedContextPayload {
  const entries = sidecars
    .flatMap((sidecar) =>
      sidecar.threads.filter(isUnresolved).map((thread) => ({
        file: sidecar.targetFile,
        threadId: thread.id,
        status: thread.status,
        quote: thread.anchor.quote,
        priority: thread.priority,
        tags: thread.tags,
        comments: thread.comments.map((comment) => ({
          author: comment.author,
          body: comment.body
        }))
      }))
    )
    .sort((a, b) => {
      const byFile = a.file.localeCompare(b.file);
      if (byFile !== 0) {
        return byFile;
      }
      return a.threadId.localeCompare(b.threadId);
    });

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    entries
  };
}

export function stringifyUnresolvedContext(sidecars: CommentSidecar[]): string {
  return JSON.stringify(buildUnresolvedContext(sidecars), null, 2);
}
