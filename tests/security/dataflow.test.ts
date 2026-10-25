import { describe, expect, it } from "vitest";
import { createDefaultAnalysisPipeline } from "../../src/analysis/defaults.js";
import { securityContext } from "../../src/security/architecture.js";
import { DataflowScanner } from "../../src/security/dataflow.js";

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
    expect(findings[0]?.trace?.some((step) => step.includes("http-input"))).toBe(true);
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
