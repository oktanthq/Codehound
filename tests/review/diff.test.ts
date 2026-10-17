import { describe, expect, it } from "vitest";
import { analyzePullDiff, parsePatch } from "../../src/review/diff.js";

const PATCH = `@@ -1,3 +1,4 @@ function greet
 export function greet(name: string) {
-  return name;
+  const copy = name;
+  return copy;
 }
`;

describe("pull diff analysis", () => {
  it("parses hunks and changed line numbers", () => {
    const hunks = parsePatch(PATCH);
    expect(hunks).toHaveLength(1);
    expect(hunks[0]?.oldStart).toBe(1);
    expect(hunks[0]?.newStart).toBe(1);
    expect(
      hunks[0]?.lines.filter((line) => line.kind === "add").map((line) => line.newLine),
    ).toEqual([2, 3]);
    expect(
      hunks[0]?.lines.some((line) => line.kind === "del" && line.text.includes("return name")),
    ).toBe(true);
    const analyzed = analyzePullDiff([
      {
        path: "src/greet.ts",
        status: "modified",
        previousPath: undefined,
        additions: 2,
        deletions: 1,
        patch: PATCH,
      },
    ]);
    expect(analyzed[0]?.addedLines).toEqual([2, 3]);
    expect(analyzed[0]?.deletedLines).toEqual([2]);
  });
});
