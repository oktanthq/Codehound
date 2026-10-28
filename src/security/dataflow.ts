import type { VulnerabilityScanner } from "./architecture.js";
import { collectTaint, taintFromAnalysis } from "./taint.js";
import { makeVulnerability, type SecurityScanContext, type VulnerabilityFinding } from "./types.js";

export class DataflowScanner implements VulnerabilityScanner {
  readonly id = "dataflow";

  scan(context: SecurityScanContext): VulnerabilityFinding[] {
    const findings: VulnerabilityFinding[] = [];
    for (const [path, content] of context.files) {
      if (!/\.(ts|js|tsx|jsx|mts|cts)$/i.test(path) || path.includes("node_modules/")) {
        continue;
      }
      const collected = collectTaint(content);
      const document = context.analysis?.documents.find((item) => item.path === path);
      if (document !== undefined) {
        taintFromAnalysis(document, content);
      }
      for (const sink of collected.sinks) {
        findings.push(
          makeVulnerability({
            category: "dataflow",
            ruleId: `dataflow.taint-${sink.id}`,
            severity: sink.id === "eval" || sink.id === "exec" ? "critical" : "high",
            title: `Tainted data reaches ${sink.title.toLowerCase()}`,
            message: "Untrusted input flows into a sensitive sink without sanitization.",
            path,
            startLine: sink.line,
            evidence: sink.text.trim(),
            cwe: sink.cwe,
            trace: collected.sources.map((source) => `${path}:${source.line}:${source.kind}`),
          }),
        );
      }
    }
    return findings;
  }
}

export function dataflowScanner(): VulnerabilityScanner {
  return new DataflowScanner();
}
