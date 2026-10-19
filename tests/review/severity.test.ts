import { describe, expect, it } from "vitest";
import { makeFinding } from "../../src/review/findings.js";
import { classifyFinding, classifyFindings } from "../../src/review/severity.js";

describe("review severity classification", () => {
  it("uses the rule table and escalates high fan-in", () => {
    const todo = makeFinding({
      category: "smell",
      ruleId: "smell.todo",
      severity: "info",
      title: "todo",
      message: "todo",
      path: "src/a.ts",
    });
    expect(classifyFinding(todo)).toBe("info");
    const http = makeFinding({
      category: "security",
      ruleId: "security.http",
      severity: "medium",
      title: "http",
      message: "http",
      path: "src/a.ts",
    });
    expect(classifyFinding(http)).toBe("high");
    const consoleFinding = makeFinding({
      category: "practice",
      ruleId: "practice.console",
      severity: "low",
      title: "console",
      message: "console",
      path: "src/core.ts",
    });
    const classified = classifyFindings(
      [consoleFinding],
      [
        {
          path: "src/core.ts",
          dependents: [
            { from: "a", to: "src/core.ts", fromKind: "file", toKind: "file" },
            { from: "b", to: "src/core.ts", fromKind: "file", toKind: "file" },
            { from: "c", to: "src/core.ts", fromKind: "file", toKind: "file" },
          ],
          dependencies: [],
          layers: [],
          rules: [],
        },
      ],
    );
    expect(classified[0]?.severity).toBe("medium");
  });
});
