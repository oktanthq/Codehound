export {
  pipelineStages,
  securityContext,
  SECURITY_PIPELINE_STAGES,
} from "./architecture.js";
export { createDefaultSecurityPipeline, SecurityPipeline } from "./engine.js";
export { makeVulnerability, vulnerabilityId, VULN_CATEGORIES, VULN_SEVERITIES } from "./types.js";

export type { Advisory, AdvisoryDatabase, VulnerabilityScanner } from "./architecture.js";
export type {
  ManifestFile,
  SecurityScanContext,
  SecurityScanReport,
  VulnCategory,
  VulnerabilityFinding,
  VulnSeverity,
} from "./types.js";
