import { detectArchitectureViolations } from "./architecture.js";
import { commentsFromFindings, type ReviewComment } from "./comments.js";
import { retrieveChangedCodeContext, type ChangedCodeContext } from "./context.js";
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
import type { Retriever } from "../rag/types.js";
import { toReviewFindings } from "../security/integrate.js";
import type { VulnerabilityFinding } from "../security/types.js";

export type ReviewInput = {
  pull?: IngestedPull;
  diffs?: AnalyzedFileDiff[];
  query?: CimQueryLayer;
  files?: Map<string, string>;
  securityFindings?: VulnerabilityFinding[] | undefined;
  retriever?: Retriever | undefined;
  codeContext?: ChangedCodeContext[] | undefined;
};

export type ReviewReport = {
  diffs: AnalyzedFileDiff[];
  impact: PullImpact[];
  findings: ReviewFinding[];
  comments: ReviewComment[];
  summary: ReviewSummary;
  codeContext: ChangedCodeContext[];
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
  const codeContext = input.codeContext ?? [];
  const context: ReviewContext = {
    diffs,
    impact,
    query: input.query,
    files: input.files ?? new Map(),
    pull: input.pull,
    codeContext,
  };
  const extra =
    input.securityFindings === undefined ? [] : toReviewFindings(input.securityFindings);
  const findings = classifyFindings([...collectFindings(context), ...extra], impact);
  return {
    diffs,
    impact,
    findings,
    comments: commentsFromFindings(findings),
    summary: summarizeReview(findings, input.pull, codeContext),
    codeContext,
  };
}

export async function reviewPullWithContext(input: ReviewInput): Promise<ReviewReport> {
  if (input.codeContext !== undefined || input.retriever === undefined) {
    return reviewPull(input);
  }
  const diffs = input.diffs ?? analyzePullDiff(input.pull?.files ?? []);
  const codeContext = await retrieveChangedCodeContext(
    input.retriever,
    diffs,
    input.pull?.pull.fullName ?? "",
  );
  return reviewPull({ ...input, diffs, codeContext });
}
