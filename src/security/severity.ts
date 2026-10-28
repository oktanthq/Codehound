import type { SecurityScanContext, VulnerabilityFinding, VulnSeverity } from "./types.js";
import { VULN_SEVERITIES } from "./types.js";

const RANK: Record<VulnSeverity, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

const CRITICAL_CWE = new Set(["CWE-78", "CWE-89", "CWE-95", "CWE-287", "CWE-798", "CWE-321"]);

export type SeverityScore = {
  severity: VulnSeverity;
  score: number;
};

export function severityRank(severity: VulnSeverity): number {
  return RANK[severity];
}

export function bumpSeverity(severity: VulnSeverity, steps = 1): VulnSeverity {
  const next = Math.min(VULN_SEVERITIES.length - 1, RANK[severity] + steps);
  return VULN_SEVERITIES[next] ?? "critical";
}

function baseScore(severity: VulnSeverity): number {
  return { info: 1, low: 3.5, medium: 5.5, high: 7.5, critical: 9.5 }[severity];
}

function fileHasPublicEndpoint(context: SecurityScanContext, path: string): boolean {
  const endpoints =
    context.analysis?.documents.find((document) => document.path === path)?.endpoints ?? [];
  return endpoints.some((endpoint) => endpoint.method !== "OPTIONS" && endpoint.method !== "HEAD");
}

function dependentCount(context: SecurityScanContext, path: string): number {
  if (context.query === undefined) {
    return 0;
  }
  return context.query.fileDependencies().filter((edge) => edge.to === path).length;
}

export function scoreVulnerability(
  finding: VulnerabilityFinding,
  context: SecurityScanContext,
): SeverityScore {
  let severity = finding.severity;
  if (
    finding.cwe !== undefined &&
    CRITICAL_CWE.has(finding.cwe) &&
    RANK[severity] < RANK.critical
  ) {
    severity = bumpSeverity(severity);
  }
  if (finding.cve !== undefined && RANK[severity] < RANK.high) {
    severity = bumpSeverity(severity);
  }
  if (finding.category === "secret" || finding.category === "injection") {
    severity = RANK[severity] < RANK.high ? "high" : severity;
    if (finding.category === "secret") {
      severity = "critical";
    }
  }
  if (fileHasPublicEndpoint(context, finding.path) && RANK[severity] < RANK.critical) {
    severity = bumpSeverity(severity);
  }
  if (dependentCount(context, finding.path) >= 3 && RANK[severity] < RANK.high) {
    severity = bumpSeverity(severity);
  }
  let score = baseScore(severity);
  if (finding.cve !== undefined) {
    score += 0.4;
  }
  if (finding.trace !== undefined && finding.trace.length > 1) {
    score += 0.3;
  }
  return { severity, score: Math.min(10, score) };
}

export function classifyVulnerabilities(
  findings: readonly VulnerabilityFinding[],
  context: SecurityScanContext,
): VulnerabilityFinding[] {
  return findings.map((finding) => {
    const scored = scoreVulnerability(finding, context);
    return { ...finding, severity: scored.severity };
  });
}
