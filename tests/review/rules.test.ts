import { describe, expect, it } from "vitest";
import { detectRuleViolations } from "../../src/review/rules.js";
import { changedFile, contextOf } from "./helpers.js";

describe("business-rule violation detection", () => {
  it("flags deletion of an exported validate function", () => {
    const findings = detectRuleViolations(
      contextOf([
        changedFile(
          "src/users.ts",
          ["export function validateUser(name: string) { return name.length > 0; }"],
          ["export function displayUser(name: string) { return name; }"],
        ),
      ]),
    );
    expect(findings.some((finding) => finding.ruleId === "rule.removed")).toBe(true);
    expect(findings[0]?.message).toContain("validateUser");
  });
});
