import { describe, expect, it } from "vitest";
import { createDefaultAnalysisPipeline } from "../../src/analysis/defaults.js";
import { ingestAnalysisRun } from "../../src/cim/from-analysis.js";
import { CodeIntelligenceModel } from "../../src/cim/model.js";
import { CimQueryLayer } from "../../src/cim/query.js";

describe("CimQueryLayer", () => {
  it("exposes graph and kind queries", async () => {
    const run = await createDefaultAnalysisPipeline().analyze(
      { repositoryFullName: "oktant/demo", commitSha: "abc", ref: "main" },
      [
        {
          path: "src/index.ts",
          language: "TypeScript",
          kind: "source",
          content:
            'import { greet } from "./greet.js";\nexport function validateName(name: string) { return greet(name); }\n',
        },
        {
          path: "src/greet.ts",
          language: "TypeScript",
          kind: "source",
          content: "export function greet(name: string) { return name; }\n",
        },
      ],
    );
    const model = new CodeIntelligenceModel();
    ingestAnalysisRun(model, run);
    const query = new CimQueryLayer(model);
    expect(query.dependencyGraph().edges.length).toBeGreaterThan(0);
    expect(query.callGraph().edges.length).toBeGreaterThan(0);
    expect(query.architectureLayers().some((entity) => entity.name === "application")).toBe(true);
    expect(query.rules().some((entity) => entity.name === "validateName")).toBe(true);
    expect(query.ruleBindings().edges.length).toBeGreaterThan(0);
  });
});
