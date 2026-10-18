import { describe, expect, it } from "vitest";
import { detectRegressionRisk } from "../../src/review/regression.js";
import { addedFile, changedFile, contextOf } from "./helpers.js";

describe("regression-risk analysis", () => {
  it("flags high fan-in files and removed exports", () => {
    const findings = detectRegressionRisk(
      contextOf([changedFile("src/greet.ts", ["export function greet() { return 1; }"], [])], {
        impact: [
          {
            path: "src/greet.ts",
            dependents: [
              { from: "src/index.ts", to: "src/greet.ts", fromKind: "file", toKind: "file" },
              { from: "tests/greet.test.ts", to: "src/greet.ts", fromKind: "file", toKind: "file" },
            ],
            dependencies: [],
            layers: ["application"],
            rules: [],
          },
        ],
      }),
    );
    expect(findings.map((finding) => finding.ruleId)).toEqual(
      expect.arrayContaining(["regression.fan-in", "regression.export-removed"]),
    );
  });

  it("flags removed test files", () => {
    const file = addedFile("tests/gone.test.ts", ["export const n = 1;"]);
    file.status = "removed";
    const findings = detectRegressionRisk(contextOf([file]));
    expect(findings.some((finding) => finding.ruleId === "regression.test-removed")).toBe(true);
  });
});
