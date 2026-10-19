import { SEVERITIES, type ReviewFinding, type ReviewSeverity } from "./findings.js";
import type { PullImpact } from "./impact.js";

const RANK: Record<ReviewSeverity, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export const RULE_SEVERITY: Record<string, ReviewSeverity> = {
  "smell.todo": "info",
  "smell.magic-number": "low",
  "smell.long-hunk": "medium",
  "smell.empty-catch": "medium",
  "smell.deep-nesting": "low",
  "practice.console": "low",
  "practice.debugger": "medium",
  "practice.var": "low",
  "practice.any": "low",
  "practice.eqeq": "low",
  "practice.ts-ignore": "medium",
  "architecture.test-import": "high",
  "architecture.layer-violation": "high",
  "rule.removed": "high",
  "rule.bypassed": "medium",
  "regression.fan-in": "high",
  "regression.export-removed": "high",
  "regression.test-removed": "medium",
  "security.eval": "critical",
  "security.xss": "high",
  "security.shell": "high",
  "security.secret": "critical",
  "security.http": "medium",
  "security.tls": "high",
};

export function severityRank(severity: ReviewSeverity): number {
  return RANK[severity];
}

export function bumpSeverity(severity: ReviewSeverity, steps = 1): ReviewSeverity {
  const next = Math.min(SEVERITIES.length - 1, RANK[severity] + steps);
  return SEVERITIES[next] ?? "critical";
}

export function classifyFinding(
  finding: ReviewFinding,
  impact: readonly PullImpact[] = [],
): ReviewSeverity {
  let severity = RULE_SEVERITY[finding.ruleId] ?? finding.severity;
  if (finding.category === "security" && RANK[severity] < RANK.high) {
    severity = "high";
  }
  const dependents = impact.find((item) => item.path === finding.path)?.dependents.length ?? 0;
  if (dependents >= 3 && RANK[severity] < RANK.high) {
    severity = bumpSeverity(severity);
  }
  return severity;
}

export function classifyFindings(
  findings: readonly ReviewFinding[],
  impact: readonly PullImpact[] = [],
): ReviewFinding[] {
  return findings.map((finding) => ({
    ...finding,
    severity: classifyFinding(finding, impact),
  }));
}

export function highestSeverity(findings: readonly ReviewFinding[]): ReviewSeverity | undefined {
  let best: ReviewSeverity | undefined;
  for (const finding of findings) {
    if (best === undefined || RANK[finding.severity] > RANK[best]) {
      best = finding.severity;
    }
  }
  return best;
}
