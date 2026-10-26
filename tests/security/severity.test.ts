import { describe, expect, it } from "vitest";
import { securityContext } from "../../src/security/architecture.js";
import {
  classifyVulnerabilities,
  scoreVulnerability,
} from "../../src/security/severity.js";
import { makeVulnerability } from "../../src/security/types.js";

describe("vulnerability severity classification", () => {
  it("raises severity for critical CWEs, CVEs, and secrets", () => {
    const context = securityContext({
      "src/a.ts": "export function run() { return 1; }\n",
    });
    const sql = makeVulnerability({
      category: "sast",
      ruleId: "sast.sql",
      severity: "medium",
      title: "SQL",
      message: "sql",
      path: "src/a.ts",
      cwe: "CWE-89",
    });
    const secret = makeVulnerability({
      category: "secret",
      ruleId: "secret.hardcoded",
      severity: "low",
      title: "Secret",
      message: "secret",
      path: "src/a.ts",
    });
    const advisory = makeVulnerability({
      category: "dependency",
      ruleId: "dependency.advisory",
      severity: "low",
      title: "Advisory",
      message: "advisory",
      path: "package.json",
      cve: "CVE-2021-23337",
      packageName: "lodash",
      packageVersion: "4.17.20",
    });
    expect(scoreVulnerability(sql, context).severity).toBe("high");
    expect(scoreVulnerability(secret, context).severity).toBe("critical");
    expect(scoreVulnerability(advisory, context).severity).toBe("medium");
    expect(scoreVulnerability(advisory, context).score).toBeGreaterThan(5);
    const classified = classifyVulnerabilities([sql, secret], context);
    expect(classified.map((finding) => finding.severity)).toEqual(["high", "critical"]);
  });
});
