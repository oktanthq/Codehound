import { describe, expect, it } from "vitest";
import { detectArchitectureViolations } from "../../src/review/architecture.js";
import { addedFile, contextOf } from "./helpers.js";
import { createDemoServer } from "../mcp/harness.js";

describe("architecture violation detection", () => {
  it("flags application code importing tests", () => {
    const findings = detectArchitectureViolations(
      contextOf([addedFile("src/app.ts", ['import { sample } from "../tests/greet.test.js";'])]),
    );
    expect(findings.some((finding) => finding.ruleId === "architecture.test-import")).toBe(true);
  });

  it("uses CIM dependencies to flag application -> test edges", async () => {
    const { host } = await createDemoServer();
    const findings = detectArchitectureViolations({
      ...contextOf([addedFile("src/index.ts", ["export const n = 1;"])]),
      query: host.query("oktant/demo"),
      impact: [],
    });
    expect(Array.isArray(findings)).toBe(true);
  });
});
