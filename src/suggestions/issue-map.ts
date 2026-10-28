import type { CimQueryLayer } from "../cim/query.js";
import type { ReviewFinding } from "../review/findings.js";
import type { Retriever } from "../rag/types.js";
import type { CodeLocation } from "./types.js";

export async function mapIssueToCode(
  issue: { text: string; path?: string },
  options: { query?: CimQueryLayer; retriever?: Retriever; findings?: ReviewFinding[] } = {},
): Promise<CodeLocation[]> {
  const locations: CodeLocation[] = [];
  const seen = new Set<string>();
  const add = (location: CodeLocation): void => {
    const key = `${location.path}:${location.startLine ?? 0}:${location.symbol ?? ""}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    locations.push(location);
  };

  for (const finding of options.findings ?? []) {
    if (issue.path !== undefined && finding.path !== issue.path) {
      continue;
    }
    if (
      issue.text.length > 0 &&
      !finding.message.toLowerCase().includes(issue.text.toLowerCase()) &&
      !finding.ruleId.includes(issue.text) &&
      !finding.path.includes(issue.text)
    ) {
      continue;
    }
    const location: CodeLocation = { path: finding.path, score: 1 };
    if (finding.startLine !== undefined) {
      location.startLine = finding.startLine;
    }
    add(location);
  }

  if (options.query !== undefined) {
    const needle = issue.text.trim().toLowerCase();
    for (const symbol of options.query.byKind("symbol")) {
      if (needle.length === 0 || !symbol.name.toLowerCase().includes(needle)) {
        continue;
      }
      const location: CodeLocation = { path: symbol.path ?? "", symbol: symbol.name, score: 0.8 };
      const start = symbol.attributes.startLine;
      if (typeof start === "number") {
        location.startLine = start;
      }
      if (location.path.length > 0) {
        add(location);
      }
    }
  }

  if (options.retriever !== undefined && issue.text.trim().length > 0) {
    const hits = await options.retriever.search({ text: issue.text, limit: 5 });
    for (const hit of hits) {
      const location: CodeLocation = {
        path: hit.chunk.path,
        startLine: hit.chunk.startLine,
        score: hit.score,
      };
      if (hit.chunk.symbol !== undefined) {
        location.symbol = hit.chunk.symbol;
      }
      add(location);
    }
  }

  return locations.sort((left, right) => right.score - left.score);
}
