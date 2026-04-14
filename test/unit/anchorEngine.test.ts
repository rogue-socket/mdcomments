import { describe, expect, it } from "vitest";
import { buildAnchorFromQuote, reanchorThread, resolveAnchor } from "../../src/comments/anchorEngine";
import type { ThreadRecord } from "../../src/comments/schema";

describe("anchorEngine", () => {
  it("resolves exact matches", () => {
    const source = "# Title\n\nThis section needs clearer acceptance criteria for release.";
    const anchor = buildAnchorFromQuote(source, "clearer acceptance criteria");
    expect(anchor).not.toBeNull();

    const result = resolveAnchor(source, anchor!);
    expect(result.confidence).toBe("exact");
    expect(result.start).toBeGreaterThan(0);
  });

  it("falls back to fuzzy matching after nearby edits", () => {
    const original = "Release checklist includes measurable acceptance criteria and risk notes.";
    const edited = "Release checklist now includes measurable acceptance criterion and risk notes.";

    const anchor = buildAnchorFromQuote(original, "measurable acceptance criteria");
    expect(anchor).not.toBeNull();

    const result = resolveAnchor(edited, anchor!);
    expect(["fuzzy", "exact"]).toContain(result.confidence);
    expect(result.start).toBeGreaterThanOrEqual(0);
  });

  it("anchors preview text with smart punctuation", () => {
    const source = "He said \"hello\" -- and left...";
    const selectedFromPreview = "He said “hello” — and left…";

    const anchor = buildAnchorFromQuote(source, selectedFromPreview);
    expect(anchor).not.toBeNull();
    expect(anchor?.quote).toContain("hello");
  });

  it("marks thread orphaned when quote disappears", () => {
    const source = "Alpha beta gamma delta";
    const thread: ThreadRecord = {
      id: "thr_1",
      status: "open",
      anchor: {
        quote: "beta gamma",
        prefix: "Alpha ",
        suffix: " delta",
        startHint: 6,
        endHint: 16,
        currentStart: 6,
        currentEnd: 16
      },
      createdBy: "local-user",
      createdAt: "2026-04-14T00:00:00.000Z",
      resolvedAt: null,
      comments: [
        {
          id: "c_1",
          author: "local-user",
          body: "Change this",
          createdAt: "2026-04-14T00:00:00.000Z",
          editedAt: null
        }
      ],
      tags: [],
      priority: "medium"
    };

    const reanchored = reanchorThread("Alpha beta only", thread);
    expect(reanchored.thread.status).toBe("orphaned");
    expect(reanchored.thread.anchor.currentStart).toBeNull();
  });
});
