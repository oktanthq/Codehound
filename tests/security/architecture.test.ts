import { describe, expect, it } from "vitest";
import {
  createDefaultSecurityPipeline,
  pipelineStages,
  SecurityPipeline,
  securityContext,
  SECURITY_PIPELINE_STAGES,
} from "../../src/security/index.js";
import { makeVulnerability } from "../../src/security/types.js";
import type { VulnerabilityScanner } from "../../src/security/architecture.js";

describe("security analysis architecture", () => {
  it("names pipeline stages from SAST through remediation", () => {
    expect(pipelineStages()).toEqual([...SECURITY_PIPELINE_STAGES]);
    expect(pipelineStages()).toEqual(
      expect.arrayContaining([
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
      ]),
    );
  });

  it("runs registered scanners against a shared scan context", async () => {
    const scanner: VulnerabilityScanner = {
      id: "fixture",
      scan(context) {
        if (!context.files.has("src/app.ts")) {
          return [];
        }
        return [
          makeVulnerability({
            category: "sast",
            ruleId: "sast.fixture",
            severity: "high",
            title: "Fixture",
            message: "scanner ran",
            path: "src/app.ts",
            startLine: 1,
            cwe: "CWE-94",
          }),
        ];
      },
    };
    const pipeline = new SecurityPipeline().register(scanner);
    const report = await pipeline.scan(securityContext({ "src/app.ts": "export const n = 1;\n" }));
    expect(report.scanners).toEqual(["fixture"]);
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]?.ruleId).toBe("sast.fixture");
    expect(report.findings[0]?.cwe).toBe("CWE-94");
    expect(createDefaultSecurityPipeline().list().map((scanner) => scanner.id)).toContain("sast");
  });
});
