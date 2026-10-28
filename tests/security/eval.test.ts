import { describe, expect, it } from "vitest";
import { createDefaultSecurityPipeline } from "../../src/security/engine.js";
import {
  evaluateSecurityScan,
  scoreCase,
  securityBenchmarkCases,
} from "../../src/security/eval.js";

describe("security-analysis evaluation benchmarks", () => {
  it("scores precision and recall on labeled cases", () => {
    expect(scoreCase(["sast.eval"], ["sast.eval"]).f1).toBe(1);
    expect(scoreCase(["sast.eval"], ["sast.eval", "injection.sql"]).recall).toBe(0.5);
    expect(scoreCase(["sast.eval", "api.weak-hash"], ["sast.eval"]).precision).toBe(0.5);
    expect(scoreCase([], []).f1).toBe(1);
  });

  it("meets recall on the built-in fixture set", async () => {
    const report = await evaluateSecurityScan(
      createDefaultSecurityPipeline(),
      securityBenchmarkCases(),
    );
    expect(report.cases).toHaveLength(securityBenchmarkCases().length);
    expect(report.meanRecall).toBe(1);
    expect(report.meanF1).toBeGreaterThan(0.5);
    const clean = report.cases.find((row) => row.id === "clean-module");
    expect(clean?.falsePositives).toBe(0);
  });
});
