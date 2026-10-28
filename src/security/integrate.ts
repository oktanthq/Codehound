import { commentsFromFindings } from "../review/comments.js";
import type { ReviewReport } from "../review/engine.js";
import { makeFinding, type ReviewFinding } from "../review/findings.js";
import { classifyFindings } from "../review/severity.js";
import { summarizeReview } from "../review/summary.js";
import type { VulnerabilityFinding } from "./types.js";

export function toReviewFindings(findings: readonly VulnerabilityFinding[]): ReviewFinding[] {
  return findings.map((finding) =>
    makeFinding({
      id: finding.id,
      category: "security",
      ruleId: finding.ruleId,
      severity: finding.severity,
      title: finding.title,
      message: finding.message,
      path: finding.path,
      startLine: finding.startLine,
      endLine: finding.endLine,
      evidence: finding.evidence,
    }),
  );
}

export function mergeSecurityIntoReview(
  report: ReviewReport,
  findings: readonly VulnerabilityFinding[],
): ReviewReport {
  const changed = new Set(report.diffs.map((diff) => diff.path));
  const extra = toReviewFindings(
    findings.filter((finding) => changed.size === 0 || changed.has(finding.path)),
  );
  const seen = new Set(report.findings.map((finding) => finding.id));
  const merged = [...report.findings, ...extra.filter((finding) => !seen.has(finding.id))];
  const classified = classifyFindings(merged, report.impact);
  return {
    ...report,
    findings: classified,
    comments: commentsFromFindings(classified),
    summary: summarizeReview(classified, undefined),
  };
}
