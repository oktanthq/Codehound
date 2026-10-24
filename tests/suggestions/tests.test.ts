import { describe, expect, it } from "vitest";
import { suggestTestsForFindings } from "../../src/suggestions/tests.js";
import { makeFinding } from "../../src/review/findings.js";

describe("test generation suggestions", () => {
  it("proposes a test module for a new source file", () => {
    const files = new Map([
      ["src/math.ts", "export function sum(a: number, b: number) { return a + b; }\n"],
    ]);
    const changes = suggestTestsForFindings(
      [
        makeFinding({
          category: "smell",
          ruleId: "smell.todo",
          severity: "info",
          title: "todo",
          message: "todo",
          path: "src/math.ts",
        }),
      ],
      files,
      [],
    );
    expect(changes[0]?.path).toBe("tests/math.test.ts");
    expect(changes[0]?.newText).toContain("sum");
  });
});
