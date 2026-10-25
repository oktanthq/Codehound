import type { VulnerabilityScanner } from "./architecture.js";
import { fileHasTaintSinks, fileHasTaintSources, collectTaint } from "./taint.js";
import {
  makeVulnerability,
  type SecurityScanContext,
  type VulnerabilityFinding,
} from "./types.js";

type FileEdge = { from: string; to: string };

function dependencyEdges(context: SecurityScanContext): FileEdge[] {
  const edges: FileEdge[] = [];
  if (context.analysis !== undefined) {
    for (const link of context.analysis.links) {
      edges.push({ from: link.fromPath, to: link.toPath });
    }
  }
  if (context.query !== undefined) {
    for (const edge of context.query.fileDependencies()) {
      edges.push({ from: edge.from, to: edge.to });
    }
  }
  return edges;
}

export class TracingScanner implements VulnerabilityScanner {
  readonly id = "tracing";

  scan(context: SecurityScanContext): VulnerabilityFinding[] {
    const findings: VulnerabilityFinding[] = [];
    const seen = new Set<string>();
    for (const edge of dependencyEdges(context)) {
      const sourceText = context.files.get(edge.from);
      const sinkText = context.files.get(edge.to);
      if (sourceText === undefined || sinkText === undefined) {
        continue;
      }
      if (!fileHasTaintSources(sourceText)) {
        continue;
      }
      const sinks = fileHasTaintSinks(sinkText);
      if (sinks.length === 0) {
        continue;
      }
      const sources = collectTaint(sourceText).sources;
      const key = `${edge.from}->${edge.to}:${sinks[0]?.id ?? ""}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      const firstSink = sinks[0];
      if (firstSink === undefined) {
        continue;
      }
      findings.push(
        makeVulnerability({
          category: "tracing",
          ruleId: "tracing.cross-component",
          severity: firstSink.id === "eval" || firstSink.id === "exec" ? "critical" : "high",
          title: "Cross-component taint path",
          message: `Untrusted input in ${edge.from} can reach ${firstSink.title.toLowerCase()} in ${edge.to}.`,
          path: edge.to,
          startLine: firstSink.line,
          evidence: firstSink.text.trim(),
          cwe: firstSink.cwe,
          trace: [
            ...sources.map((source) => `${edge.from}:${source.line}:${source.kind}`),
            `${edge.to}:${firstSink.line}:${firstSink.id}`,
          ],
        }),
      );
    }
    return findings;
  }
}

export function tracingScanner(): VulnerabilityScanner {
  return new TracingScanner();
}
