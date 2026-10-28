import { describe, expect, it } from "vitest";
import { unifiedDiff } from "../../src/suggestions/patch.js";

describe("patch generation", () => {
  it("emits a unified diff for a single-hunk edit", () => {
    const patch = unifiedDiff("src/a.ts", "export const n = 1;\n", "export const n = 2;\n");
    expect(patch).toContain("--- a/src/a.ts");
    expect(patch).toContain("+++ b/src/a.ts");
    expect(patch).toContain("-export const n = 1;");
    expect(patch).toContain("+export const n = 2;");
  });
});
