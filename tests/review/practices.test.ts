import { describe, expect, it } from "vitest";
import { detectBadPractices } from "../../src/review/practices.js";
import { addedFile, contextOf } from "./helpers.js";

describe("bad-practice detection", () => {
  it("flags console, debugger, var, any, ts-ignore, and loose equality", () => {
    const findings = detectBadPractices(
      contextOf([
        addedFile("src/util.ts", [
          "var count = 0;",
          "console.log(count);",
          "if (count == 1) { debugger; }",
          "export function take(value: any) {",
          "  // @ts-ignore",
          "  return value;",
          "}",
        ]),
      ]),
    );
    expect(findings.map((finding) => finding.ruleId)).toEqual(
      expect.arrayContaining([
        "practice.console",
        "practice.debugger",
        "practice.var",
        "practice.any",
        "practice.ts-ignore",
        "practice.eqeq",
      ]),
    );
  });

  it("ignores console usage in tests", () => {
    const findings = detectBadPractices(
      contextOf([addedFile("tests/util.test.ts", ["console.log('ok');"])]),
    );
    expect(findings).toEqual([]);
  });
});
