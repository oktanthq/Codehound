import type { AnalysisRun } from "../analysis/types.js";
import type { CimQueryLayer } from "../cim/query.js";
import type {
  ManifestFile,
  SecurityScanContext,
  SecurityScanReport,
  VulnerabilityFinding,
} from "./types.js";

export const SECURITY_PIPELINE_STAGES = [
  "sast",
  "dependency",
  "secret",
  "auth",
  "dataflow",
  "injection",
  "insecure-api",
  "business-rule",
  "tracing",
  "classify",
  "remediate",
] as const;

export type SecurityPipelineStage = (typeof SECURITY_PIPELINE_STAGES)[number];

export type VulnerabilityScanner = {
  readonly id: string;
  scan: (context: SecurityScanContext) => VulnerabilityFinding[] | Promise<VulnerabilityFinding[]>;
};

export type Advisory = {
  id: string;
  packageName: string;
  ecosystem: "npm";
  vulnerableRange: string;
  patchedVersion: string | undefined;
  severity: VulnerabilityFinding["severity"];
  cve: string | undefined;
  cwe: string | undefined;
  title: string;
  url: string | undefined;
};

export type AdvisoryDatabase = {
  readonly id: string;
  lookup: (packageName: string, version: string) => Promise<Advisory[]>;
};

export function pipelineStages(): SecurityPipelineStage[] {
  return [...SECURITY_PIPELINE_STAGES];
}

function fileMap(
  files: Record<string, string> | Map<string, string> | { path: string; content: string }[],
): Map<string, string> {
  if (files instanceof Map) {
    return files;
  }
  if (Array.isArray(files)) {
    return new Map(files.map((file) => [file.path, file.content]));
  }
  return new Map(Object.entries(files));
}

function manifestsFrom(files: Map<string, string>): ManifestFile[] {
  const manifests: ManifestFile[] = [];
  for (const [path, content] of files) {
    if (
      path.endsWith("package.json") ||
      path.endsWith("package-lock.json") ||
      path.endsWith("yarn.lock") ||
      path.endsWith("pnpm-lock.yaml")
    ) {
      manifests.push({ path, content });
    }
  }
  return manifests;
}

export function securityContext(
  files: Record<string, string> | Map<string, string> | { path: string; content: string }[],
  extras: {
    repositoryFullName?: string;
    commitSha?: string;
    analysis?: AnalysisRun | undefined;
    query?: CimQueryLayer | undefined;
    manifests?: ManifestFile[];
    files?: Map<string, string>;
  } = {},
): SecurityScanContext {
  const map = extras.files ?? fileMap(files);
  return {
    repositoryFullName: extras.repositoryFullName ?? "oktant/demo",
    commitSha: extras.commitSha ?? "abc",
    files: map,
    analysis: extras.analysis,
    query: extras.query,
    manifests: extras.manifests ?? manifestsFrom(map),
  };
}

export type { SecurityScanContext, SecurityScanReport, VulnerabilityFinding };
