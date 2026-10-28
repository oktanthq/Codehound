import { describe, expect, it } from "vitest";
import { ingestAnalysisRun } from "../../src/cim/from-analysis.js";
import { CodeIntelligenceModel } from "../../src/cim/model.js";
import { InMemoryCimStore, persistModel } from "../../src/cim/store.js";
import { createDefaultAnalysisPipeline } from "../../src/analysis/defaults.js";

describe("InMemoryCimStore", () => {
  it("persists and reloads a snapshot", async () => {
    const run = await createDefaultAnalysisPipeline().analyze(
      { repositoryFullName: "oktant/demo", commitSha: "abc", ref: "main" },
      [
        {
          path: "src/a.ts",
          language: "TypeScript",
          kind: "source",
          content: "export const n = 1;\n",
        },
      ],
    );
    const model = new CodeIntelligenceModel();
    ingestAnalysisRun(model, run);
    const store = new InMemoryCimStore();
    const saved = await persistModel(
      store,
      model,
      "oktant/demo",
      "abc",
      "2023-11-14T22:13:20.000Z",
    );
    expect(saved.entities.length).toBeGreaterThan(0);
    expect((await store.getLatest("oktant/demo"))?.commitSha).toBe("abc");
    const restored = new CodeIntelligenceModel();
    restored.loadSnapshot(saved);
    expect(restored.currentVersion()).toBe(saved.version);
    expect(restored.listEntities()).toHaveLength(saved.entities.length);
  });
});
