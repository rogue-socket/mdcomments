import { describe, expect, it } from "vitest";
import { buildUnresolvedContext } from "../../src/ai/contextExporter";
import type { CommentSidecar } from "../../src/comments/schema";

describe("contextExporter", () => {
  it("exports only unresolved threads", () => {
    const sidecar: CommentSidecar = {
      version: 1,
      targetFile: "README.md",
      updatedAt: "2026-04-14T00:00:00.000Z",
      threads: [
        {
          id: "thr_1",
          status: "open",
          anchor: {
            quote: "hello",
            prefix: "",
            suffix: "",
            startHint: 0,
            endHint: 5,
            currentStart: 0,
            currentEnd: 5
          },
          createdBy: "local-user",
          createdAt: "2026-04-14T00:00:00.000Z",
          resolvedAt: null,
          comments: [
            {
              id: "c_1",
              author: "local-user",
              body: "Update",
              createdAt: "2026-04-14T00:00:00.000Z",
              editedAt: null
            }
          ],
          tags: ["copy"],
          priority: "medium"
        },
        {
          id: "thr_2",
          status: "resolved",
          anchor: {
            quote: "world",
            prefix: "",
            suffix: "",
            startHint: 0,
            endHint: 5,
            currentStart: 0,
            currentEnd: 5
          },
          createdBy: "local-user",
          createdAt: "2026-04-14T00:00:00.000Z",
          resolvedAt: "2026-04-14T00:00:00.000Z",
          comments: [
            {
              id: "c_2",
              author: "local-user",
              body: "Done",
              createdAt: "2026-04-14T00:00:00.000Z",
              editedAt: null
            }
          ],
          tags: [],
          priority: "low"
        }
      ]
    };

    const exported = buildUnresolvedContext([sidecar]);
    expect(exported.entries).toHaveLength(1);
    expect(exported.entries[0].threadId).toBe("thr_1");
    expect(exported.entries[0].file).toBe("README.md");
  });
});
