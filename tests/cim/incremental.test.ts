import { describe, expect, it } from "vitest";
import { createDefaultAnalysisPipeline } from "../../src/analysis/defaults.js";
import { ingestAnalysisRun } from "../../src/cim/from-analysis.js";
import { CodeIntelligenceModel } from "../../src/cim/model.js";

describe("CIM incremental update", () => {
  it("replaces entities for a changed file path", async () => {
    const pipeline = createDefaultAnalysisPipeline();
    const first = await pipeline.analyze(
      { repositoryFullName: "oktant/demo", commitSha: "aaa", ref: "main" },
      [
        {
          path: "src/a.ts",
          language: "TypeScript",
          kind: "source",
          content: "export function alpha() { return 1; }\n",
        },
      ],
    );
    const model = new CodeIntelligenceModel();
    ingestAnalysisRun(model, first);
    expect(model.query({ name: "alpha" }).length).toBeGreaterThan(0);
    const removed = model.removeByPath("src/a.ts");
    expect(removed.entities).toBeGreaterThan(0);
    const second = await pipeline.analyze(
      { repositoryFullName: "oktant/demo", commitSha: "bbb", ref: "main" },
      [
        {
          path: "src/a.ts",
          language: "TypeScript",
          kind: "source",
          content: "export function beta() { return 2; }\n",
        },
      ],
    );
    ingestAnalysisRun(model, second);
    expect(model.query({ name: "alpha" })).toHaveLength(0);
    expect(model.query({ name: "beta" }).length).toBeGreaterThan(0);
    expect(model.bumpVersion()).toBeGreaterThan(1);
  });
});
