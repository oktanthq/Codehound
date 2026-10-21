import { describe, expect, it } from "vitest";
import { makeFinding } from "../../src/review/findings.js";
import { suggestSingleFileChange } from "../../src/suggestions/generate.js";

describe("single-file code suggestions", () => {
  it("rewrites a file to drop console.log and loose equality", () => {
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
      ["src/a.ts", "export function run(n: number) {\n  console.log(n);\n  return n == 1;\n}\n"],
    ]);
    const change = suggestSingleFileChange(finding, files, []);
    expect(change?.newText).not.toContain("console.log");
    const eq = makeFinding({ ...finding, ruleId: "practice.eqeq", title: "Loose equality" });
    expect(suggestSingleFileChange(eq, files, [])?.newText).toContain("===");
  });
});
