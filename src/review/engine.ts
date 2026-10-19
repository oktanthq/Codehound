import { detectArchitectureViolations } from "./architecture.js";
import { commentsFromFindings, type ReviewComment } from "./comments.js";
import { analyzePullDiff } from "./diff.js";
import type { ReviewContext, ReviewFinding } from "./findings.js";
import { analyzePullImpact, type PullImpact } from "./impact.js";
import { detectBadPractices } from "./practices.js";
import { detectRegressionRisk } from "./regression.js";
import { detectRuleViolations } from "./rules.js";
import { detectSecurityRisks } from "./security.js";
import { classifyFindings } from "./severity.js";
import { detectCodeSmells } from "./smells.js";
import { summarizeReview, type ReviewSummary } from "./summary.js";
import type { AnalyzedFileDiff, IngestedPull } from "./types.js";
import type { CimQueryLayer } from "../cim/query.js";

export type ReviewInput = {
  pull?: IngestedPull;
  diffs?: AnalyzedFileDiff[];
  query?: CimQueryLayer;
  files?: Map<string, string>;
};

export type ReviewReport = {
  diffs: AnalyzedFileDiff[];
  impact: PullImpact[];
  findings: ReviewFinding[];
  comments: ReviewComment[];
  summary: ReviewSummary;
};

export function collectFindings(context: ReviewContext): ReviewFinding[] {
  return [
    ...detectCodeSmells(context),
    ...detectBadPractices(context),
    ...detectArchitectureViolations(context),
    ...detectRuleViolations(context),
    ...detectRegressionRisk(context),
    ...detectSecurityRisks(context),
  ];
}

export function reviewPull(input: ReviewInput): ReviewReport {
  const diffs = input.diffs ?? analyzePullDiff(input.pull?.files ?? []);
  const impact = input.query === undefined ? [] : analyzePullImpact(input.query, diffs);
  const context: ReviewContext = {
    diffs,
    impact,
    query: input.query,
    files: input.files ?? new Map(),
    pull: input.pull,
  };
  const findings = classifyFindings(collectFindings(context), impact);
  return {
    diffs,
    impact,
    findings,
    comments: commentsFromFindings(findings),
    summary: summarizeReview(findings, input.pull),
  };
}
