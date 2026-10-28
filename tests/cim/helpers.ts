import { createDefaultAnalysisPipeline } from "../../src/analysis/defaults.js";
import { ingestAnalysisRun } from "../../src/cim/from-analysis.js";
import { CodeIntelligenceModel } from "../../src/cim/model.js";
import { CimQueryLayer } from "../../src/cim/query.js";

export async function modelFrom(
  files: { path: string; content: string }[],
  context: { commitSha?: string } = {},
) {
  const run = await createDefaultAnalysisPipeline().analyze(
    {
      repositoryFullName: "oktant/demo",
      commitSha: context.commitSha ?? "abc",
      ref: "main",
    },
    files.map((file) => ({
      path: file.path,
      language: "TypeScript",
      kind: "source" as const,
      content: file.content,
    })),
  );
  const model = new CodeIntelligenceModel();
  ingestAnalysisRun(model, run);
  return { model, query: new CimQueryLayer(model), run };
}
