import { describe, expect, it } from "vitest";
import { createDefaultAnalysisPipeline } from "../../src/analysis/defaults.js";
import type { AnalysisDocument, AnalysisRun, DataFlowEdge } from "../../src/analysis/types.js";
import { securityContext } from "../../src/security/architecture.js";
import { DataflowScanner } from "../../src/security/dataflow.js";

function analysisWithFlows(path: string, dataFlows: DataFlowEdge[]): AnalysisRun {
  const document: AnalysisDocument = {
    path,
    language: "TypeScript",
    adapterId: "typescript",
    symbols: [],
    imports: [],
    calls: [],
    relations: [],
    endpoints: [],
    dataFlows,
    components: [],
  };
  return {
    context: { repositoryFullName: "oktant/demo", commitSha: "abc", ref: "main" },
    documents: [document],
    skipped: [],
    links: [],
  };
}

describe("data-flow security analysis", () => {
  it("tracks request input into eval and exec sinks", async () => {
    const source = [
      "export function run(req: { query: { q: string } }) {",
      "  const q = req.query.q;",
      "  eval(q);",
      "  exec(q);",
      "}",
    ].join("\n");
    const run = await createDefaultAnalysisPipeline().analyze(
      { repositoryFullName: "oktant/demo", commitSha: "abc", ref: "main" },
      [{ path: "src/run.ts", language: "TypeScript", kind: "source", content: source }],
    );
    const findings = new DataflowScanner().scan(
      securityContext({ "src/run.ts": source }, { analysis: run }),
    );
    const ids = findings.map((finding) => finding.ruleId);
    expect(ids).toContain("dataflow.taint-eval");
    expect(ids).toContain("dataflow.taint-exec");
    expect(ids.filter((id) => id === "dataflow.taint-eval")).toHaveLength(1);
    expect(ids.filter((id) => id === "dataflow.taint-exec")).toHaveLength(1);
    expect(findings[0]?.trace?.some((step) => step.includes("http-input"))).toBe(true);
  });

  it("flags a sink reached only through analysis data-flow propagation", () => {
    const source = [
      "export function run(req: { query: { q: string } }) {",
      "  const q = req.query.q;",
      "  eval(payload);",
      "}",
    ].join("\n");
    const withoutAnalysis = new DataflowScanner().scan(securityContext({ "src/run.ts": source }));
    expect(withoutAnalysis).toEqual([]);

    const findings = new DataflowScanner().scan(
      securityContext(
        { "src/run.ts": source },
        {
          analysis: analysisWithFlows("src/run.ts", [
            { from: "q", to: "payload", kind: "assign", startLine: 3 },
          ]),
        },
      ),
    );
    expect(findings.map((finding) => finding.ruleId)).toEqual(["dataflow.taint-eval"]);
    expect(findings[0]?.trace?.some((step) => step.includes("http-input"))).toBe(true);
    expect(findings[0]?.trace?.some((step) => step.includes("payload"))).toBe(true);
  });

  it("does not flag sinks that only receive literals", () => {
    const findings = new DataflowScanner().scan(
      securityContext({
        "src/ok.ts": 'export function run() { eval("1+1"); innerHTML = "safe"; }\n',
      }),
    );
    expect(findings).toEqual([]);
  });
});
