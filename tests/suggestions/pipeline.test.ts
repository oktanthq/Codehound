import { describe, expect, it } from "vitest";
import { makeFinding } from "../../src/review/findings.js";
import { generateSuggestions, pipelineStages } from "../../src/suggestions/pipeline.js";

describe("change generation pipeline", () => {
  it("names stages and emits validated single-file suggestions", () => {
    expect(pipelineStages()).toEqual(
      expect.arrayContaining(["generate-single-file", "emit-patch", "validate"]),
    );
    const suggestions = generateSuggestions({
      findings: [
        makeFinding({
          category: "practice",
          ruleId: "practice.console",
          severity: "low",
          title: "Console usage",
          message: "console",
          path: "src/a.ts",
          startLine: 2,
        }),
      ],
      diffs: [],
      files: new Map([
        ["src/a.ts", "export function run() {\n  console.log(1);\n  return 1;\n}\n"],
      ]),
    });
    expect(suggestions.some((suggestion) => suggestion.kind === "single-file")).toBe(true);
    expect(suggestions[0]?.patch).toContain("-  console.log(1);");
    expect(suggestions[0]?.validation.ok).toBe(true);
  });
});
