import { describe, expect, it } from "vitest";
import { createEmptySidecar, parseSidecar } from "../../src/comments/schema";

describe("schema", () => {
  it("creates an empty valid sidecar", () => {
    const sidecar = createEmptySidecar("docs/spec.md");
    const parsed = parseSidecar(sidecar);
    expect(parsed.targetFile).toBe("docs/spec.md");
    expect(parsed.threads).toHaveLength(0);
  });

  it("rejects invalid versions", () => {
    expect(() =>
      parseSidecar({
        version: 999,
        targetFile: "docs/spec.md",
        updatedAt: new Date().toISOString(),
        threads: []
      })
    ).toThrow();
  });
});
