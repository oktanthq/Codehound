import type { AnalysisRun } from "../analysis/types.js";
import type { CimQueryLayer } from "../cim/query.js";

export const VULN_SEVERITIES = ["info", "low", "medium", "high", "critical"] as const;

export type VulnSeverity = (typeof VULN_SEVERITIES)[number];

export const VULN_CATEGORIES = [
  "sast",
  "dependency",
  "secret",
  "auth",
  "dataflow",
  "injection",
  "insecure-api",
  "business-rule",
  "tracing",
] as const;

export type VulnCategory = (typeof VULN_CATEGORIES)[number];

export type VulnerabilityFinding = {
  id: string;
  ruleId: string;
  category: VulnCategory;
  severity: VulnSeverity;
  title: string;
  message: string;
  path: string;
  startLine: number | undefined;
  endLine: number | undefined;
  evidence: string | undefined;
  cwe: string | undefined;
  cve: string | undefined;
  packageName: string | undefined;
  packageVersion: string | undefined;
  trace: string[] | undefined;
};

export type ManifestFile = {
  path: string;
  content: string;
};

export type SecurityScanContext = {
  repositoryFullName: string;
  commitSha: string;
  files: Map<string, string>;
  analysis: AnalysisRun | undefined;
  query: CimQueryLayer | undefined;
  manifests: ManifestFile[];
};

export type SecurityScanReport = {
  findings: VulnerabilityFinding[];
  scanners: string[];
};

export function vulnerabilityId(
  ruleId: string,
  path: string,
  line: number | undefined,
  extra = "",
): string {
  const suffix = extra.length > 0 ? `:${extra}` : "";
  return `${ruleId}:${path}:${line ?? 0}${suffix}`;
}

export function makeVulnerability(
  fields: Omit<
    VulnerabilityFinding,
    | "id"
    | "startLine"
    | "endLine"
    | "evidence"
    | "cwe"
    | "cve"
    | "packageName"
    | "packageVersion"
    | "trace"
  > & {
    id?: string;
    startLine?: number | undefined;
    endLine?: number | undefined;
    evidence?: string | undefined;
    cwe?: string | undefined;
    cve?: string | undefined;
    packageName?: string | undefined;
    packageVersion?: string | undefined;
    trace?: string[] | undefined;
  },
): VulnerabilityFinding {
  return {
    id: fields.id ?? vulnerabilityId(fields.ruleId, fields.path, fields.startLine, fields.cve ?? ""),
    ruleId: fields.ruleId,
    category: fields.category,
    severity: fields.severity,
    title: fields.title,
    message: fields.message,
    path: fields.path,
    startLine: fields.startLine,
    endLine: fields.endLine,
    evidence: fields.evidence,
    cwe: fields.cwe,
    cve: fields.cve,
    packageName: fields.packageName,
    packageVersion: fields.packageVersion,
    trace: fields.trace,
  };
}
