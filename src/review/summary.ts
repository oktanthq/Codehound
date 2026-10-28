import { SEVERITIES, type ReviewFinding, type ReviewSeverity } from "./findings.js";
import { highestSeverity } from "./severity.js";
import type { IngestedPull } from "./types.js";

export type ReviewEvent = "COMMENT" | "REQUEST_CHANGES" | "APPROVE";

export type ReviewSummary = {
  title: string;
  body: string;
  event: ReviewEvent;
  findingCount: number;
  counts: Record<ReviewSeverity, number>;
};

export function emptyCounts(): Record<ReviewSeverity, number> {
  return { info: 0, low: 0, medium: 0, high: 0, critical: 0 };
}

export function countBySeverity(
  findings: readonly ReviewFinding[],
): Record<ReviewSeverity, number> {
  const counts = emptyCounts();
  for (const finding of findings) {
    counts[finding.severity] += 1;
  }
  return counts;
}

export function reviewEventFor(findings: readonly ReviewFinding[]): ReviewEvent {
  if (findings.length === 0) {
    return "APPROVE";
  }
  const highest = highestSeverity(findings);
  if (highest === "critical" || highest === "high") {
    return "REQUEST_CHANGES";
  }
  return "COMMENT";
}

export function summarizeReview(
  findings: readonly ReviewFinding[],
  pull: IngestedPull | undefined = undefined,
): ReviewSummary {
  const counts = countBySeverity(findings);
  const event = reviewEventFor(findings);
  const headline =
    findings.length === 0
      ? "No review findings"
      : `${findings.length} finding(s) (${SEVERITIES.filter((severity) => counts[severity] > 0)
          .map((severity) => `${severity}: ${counts[severity]}`)
          .join(", ")})`;
  const top = findings
    .slice()
    .sort((left, right) => {
      const rank = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };
      return rank[right.severity] - rank[left.severity];
    })
    .slice(0, 5)
    .map((finding) => `- [${finding.severity}] ${finding.path}: ${finding.title}`);
  const pullLine =
    pull === undefined ? "" : `Pull request #${pull.pull.number} (${pull.pull.title})\n\n`;
  const body = [
    `# Codehound review`,
    "",
    pullLine + headline,
    "",
    top.length > 0 ? "## Top findings\n\n" + top.join("\n") : "No inline findings.",
  ].join("\n");
  return {
    title: headline,
    body,
    event,
    findingCount: findings.length,
    counts,
  };
}
