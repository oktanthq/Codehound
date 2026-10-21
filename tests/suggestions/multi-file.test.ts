import { describe, expect, it } from "vitest";
import { makeFinding } from "../../src/review/findings.js";
import { suggestCompanionTest, suggestMultiFileChanges } from "../../src/suggestions/generate.js";

describe("multi-file code changes", () => {
  it("pairs a source fix with a companion test module", () => {
    const finding = makeFinding({
      category: "practice",
      ruleId: "practice.console",
      severity: "low",
      title: "Console usage",
      message: "console",
      path: "src/a.ts",
      startLine: 2,
    });
    const files = new Map([
      ["src/a.ts", "export function run() {\n  console.log(1);\n  return 1;\n}\n"],
    ]);
    const multi = suggestMultiFileChanges(finding, files, []);
    expect(multi.some((change) => change.path === "src/a.ts")).toBe(true);
    expect(multi.some((change) => change.path === "tests/a.test.ts")).toBe(true);
    const test = suggestCompanionTest("src/a.ts", "export function run() { return 1; }\n", files);
    expect(test?.newText).toContain("import { run }");
  });
});
