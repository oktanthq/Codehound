import { isRuleName } from "../cim/rules.js";
import type { VulnerabilityScanner } from "./architecture.js";
import { isCodeComment, sourceLines } from "./text.js";
import {
  makeVulnerability,
  type SecurityScanContext,
  type VulnerabilityFinding,
} from "./types.js";

export const SECURITY_RULE_NAME =
  /^(authenticate|authorize|sanitize|escapeHtml|encrypt|decrypt|hashPassword|verifyPassword|csrfProtect|rateLimit|validateAuth)/i;

const SECURITY_RULE_IN_SOURCE =
  /\b(authenticate|authorize|sanitize|escapeHtml|encrypt|decrypt|hashPassword|verifyPassword|csrfProtect|rateLimit|validateAuth)\b/;

export function isSecurityRuleName(name: string): boolean {
  return SECURITY_RULE_NAME.test(name) || (isRuleName(name) && /auth|csrf|sanitiz|encrypt/i.test(name));
}

const ENDPOINT = /\b(?:app|router)\.(get|post|put|patch|delete)\(/;

export class SecurityRuleScanner implements VulnerabilityScanner {
  readonly id = "business-rule";

  scan(context: SecurityScanContext): VulnerabilityFinding[] {
    const findings: VulnerabilityFinding[] = [];
    const securityRules =
      context.query?.rules().filter((rule) => isSecurityRuleName(rule.name)) ?? [];
    const governedFiles = new Set(
      (context.query?.ruleBindings().edges ?? [])
        .filter((edge) => securityRules.some((rule) => rule.id === edge.fromId))
        .map((edge) => edge.toId),
    );

    for (const [path, content] of context.files) {
      if (!/\.(ts|js|tsx|jsx|mts|cts)$/i.test(path) || path.includes("node_modules/")) {
        continue;
      }
      const endpoints =
        context.analysis?.documents.find((document) => document.path === path)?.endpoints ?? [];
      const routeLine = sourceLines(content).find(
        (row) => ENDPOINT.test(row.text) && !isCodeComment(row.text),
      );
      const hasRoute = endpoints.length > 0 || routeLine !== undefined;
      if (!hasRoute) {
        continue;
      }
      const startLine = endpoints[0]?.startLine ?? routeLine?.line;
      const fileHasSecurityRule = SECURITY_RULE_IN_SOURCE.test(content);
      if (securityRules.length === 0 && !fileHasSecurityRule) {
        findings.push(
          makeVulnerability({
            category: "business-rule",
            ruleId: "rule.missing-security",
            severity: "high",
            title: "Missing security business rule",
            message:
              "This module exposes HTTP routes but defines no authenticate/authorize/sanitize rule.",
            path,
            startLine,
            evidence: routeLine?.text.trim(),
            cwe: "CWE-693",
          }),
        );
        continue;
      }
      if (context.query === undefined) {
        continue;
      }
      const fileEntity = context.query.entities({ kind: "file" }).find((entity) => entity.path === path);
      const fileGoverned = fileEntity !== undefined && governedFiles.has(fileEntity.id);
      if (!fileGoverned && !fileHasSecurityRule && securityRules.length > 0) {
        findings.push(
          makeVulnerability({
            category: "business-rule",
            ruleId: "rule.ungoverned-endpoint",
            severity: "medium",
            title: "Endpoint not governed by a security rule",
            message: "A security rule exists in the model but does not govern this route module.",
            path,
            startLine,
            evidence: routeLine?.text.trim(),
            cwe: "CWE-693",
          }),
        );
      }
    }
    return findings;
  }
}

export function securityRuleScanner(): VulnerabilityScanner {
  return new SecurityRuleScanner();
}
