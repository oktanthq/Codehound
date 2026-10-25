import { type AdvisoryDatabase, type VulnerabilityScanner } from "./architecture.js";
import { dependencyScanner } from "./dependencies.js";
import { sastScanner } from "./sast.js";
import type { SecurityScanContext, SecurityScanReport, VulnerabilityFinding } from "./types.js";

export class SecurityPipeline {
  private readonly scanners: VulnerabilityScanner[] = [];

  constructor(scanners: readonly VulnerabilityScanner[] = []) {
    this.scanners.push(...scanners);
  }

  register(scanner: VulnerabilityScanner): this {
    this.scanners.push(scanner);
    return this;
  }

  list(): readonly VulnerabilityScanner[] {
    return this.scanners;
  }

  async scan(context: SecurityScanContext): Promise<SecurityScanReport> {
    const findings: VulnerabilityFinding[] = [];
    for (const scanner of this.scanners) {
      const result = await scanner.scan(context);
      findings.push(...result);
    }
    return {
      findings,
      scanners: this.scanners.map((scanner) => scanner.id),
    };
  }
}

export function createDefaultSecurityPipeline(options: {
  advisories?: AdvisoryDatabase;
} = {}): SecurityPipeline {
  return new SecurityPipeline([sastScanner(), dependencyScanner(options.advisories)]);
}
