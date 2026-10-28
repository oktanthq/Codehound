import { describe, expect, it } from "vitest";
import { detectCodeSmells } from "../../src/review/smells.js";
import { addedFile, contextOf } from "./helpers.js";

describe("code smell detection", () => {
  it("flags TODO markers, magic numbers, empty catches, and long hunks", () => {
    const long = Array.from({ length: 41 }, (_, index) => `  const n${index} = ${index};`);
    const findings = detectCodeSmells(
      contextOf([
        addedFile("src/a.ts", [
          "export function run() {",
          "  try { return 1; } catch (error) {}",
          "  const timeout = 86400;",
          "  // TODO: remove this",
          "                deeply.nested();",
          "}",
        ]),
        addedFile("src/big.ts", long),
      ]),
    );
    const rules = findings.map((finding) => finding.ruleId);
    expect(rules).toEqual(
      expect.arrayContaining([
        "smell.todo",
        "smell.magic-number",
        "smell.empty-catch",
        "smell.deep-nesting",
        "smell.long-hunk",
      ]),
    );
  });
});
