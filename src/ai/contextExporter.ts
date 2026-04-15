import type { CommentSidecar, ThreadRecord } from "../comments/schema";

export interface SimplifiedContextEntry {
  text: string;
  thread: Array<{
    author: string;
    comment: string;
  }>;
}

function isUnresolved(thread: ThreadRecord): thread is ThreadRecord & { status: "open" | "orphaned" } {
  return thread.status === "open" || thread.status === "orphaned";
}

export function buildUnresolvedContext(sidecars: CommentSidecar[]): SimplifiedContextEntry[] {
  return sidecars
    .flatMap((sidecar) =>
      sidecar.threads.filter(isUnresolved).map((thread) => ({
        text: thread.anchor.quote,
        thread: thread.comments.map((comment) => ({
          author: comment.author,
          comment: comment.body
        }))
      }))
    )
    .sort((a, b) => a.text.localeCompare(b.text));
}

export function stringifyUnresolvedContext(sidecars: CommentSidecar[]): string {
  return JSON.stringify(buildUnresolvedContext(sidecars), null, 2);
}
