import type { AnalyzedFileDiff, DiffLine } from "./types.js";
import type { CimQueryLayer } from "../cim/query.js";
import type { PullImpact } from "./impact.js";
import type { IngestedPull } from "./types.js";

export const SEVERITIES = ["info", "low", "medium", "high", "critical"] as const;

export type ReviewSeverity = (typeof SEVERITIES)[number];

export type ReviewCategory =
  "smell" | "practice" | "architecture" | "rule" | "regression" | "security";

export type ReviewFinding = {
  id: string;
  category: ReviewCategory;
  ruleId: string;
  severity: ReviewSeverity;
  title: string;
  message: string;
  path: string;
  startLine: number | undefined;
  endLine: number | undefined;
  evidence: string | undefined;
};

export type AddedLine = {
  path: string;
  line: number;
  text: string;
};

export type ReviewContext = {
  diffs: AnalyzedFileDiff[];
  impact: PullImpact[];
  query: CimQueryLayer | undefined;
  files: Map<string, string>;
  pull: IngestedPull | undefined;
};

export function findingId(ruleId: string, path: string, line: number | undefined): string {
  return `${ruleId}:${path}:${line ?? 0}`;
}

export function makeFinding(
  fields: Omit<ReviewFinding, "id" | "startLine" | "endLine" | "evidence"> & {
    id?: string;
    startLine?: number | undefined;
    endLine?: number | undefined;
    evidence?: string | undefined;
  },
): ReviewFinding {
  return {
    id: fields.id ?? findingId(fields.ruleId, fields.path, fields.startLine),
    category: fields.category,
    ruleId: fields.ruleId,
    severity: fields.severity,
    title: fields.title,
    message: fields.message,
    path: fields.path,
    startLine: fields.startLine,
    endLine: fields.endLine,
    evidence: fields.evidence,
  };
}

export function addedLinesOf(diff: AnalyzedFileDiff): AddedLine[] {
  return linesOfKind(diff, "add");
}

export function deletedLinesOf(diff: AnalyzedFileDiff): AddedLine[] {
  return linesOfKind(diff, "del");
}

function linesOfKind(diff: AnalyzedFileDiff, kind: DiffLine["kind"]): AddedLine[] {
  const lines: AddedLine[] = [];
  for (const hunk of diff.hunks) {
    for (const row of hunk.lines) {
      if (row.kind !== kind) {
        continue;
      }
      const line = kind === "add" ? row.newLine : row.oldLine;
      if (line === undefined) {
        continue;
      }
      lines.push({ path: diff.path, line, text: row.text });
    }
  }
  return lines;
}

export function joinAdded(diff: AnalyzedFileDiff): string {
  return addedLinesOf(diff)
    .map((line) => line.text)
    .join("\n");
}

export function firstMatchingLine(
  lines: readonly AddedLine[],
  pattern: RegExp,
): AddedLine | undefined {
  return lines.find((line) => pattern.test(line.text));
}
