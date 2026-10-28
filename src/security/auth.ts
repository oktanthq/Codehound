import type { VulnerabilityScanner } from "./architecture.js";
import { isCodeComment, sourceLines } from "./text.js";
import { makeVulnerability, type SecurityScanContext, type VulnerabilityFinding } from "./types.js";

const AUTH_HINT =
  /\b(authenticate|authorize|requireAuth|requireAdmin|isAuthenticated|checkPermission|passport|jwt\.verify|protect|allowlist|authn|authz|middleware\.auth)\b/i;

const PUBLIC_PATH = /^\/?(health|ping|status|ready|livez|readyz)?$/i;

const SENSITIVE_PATH = /\/(admin|internal|private|account|user|users|me|settings|billing)\b/i;

const ROUTE = /\b(?:app|router)\.(get|post|put|patch|delete|all|use)\(\s*(['"`])([^'"`]+)\2/i;

const JWT_DECODE = /\bjwt\.decode\s*\(/;
const JWT_VERIFY = /\bjwt\.verify\s*\(/;

const AUTH_BYPASS = /\b(req\.(?:user|session)|currentUser)\s*=\s*req\.(query|body|params)/;

function shouldFlagEndpoint(
  method: string,
  path: string,
  line: string,
  fileHasAuth: boolean,
): boolean {
  if (lineHasAuth(line)) {
    return false;
  }
  if (PUBLIC_PATH.test(path) && method.toUpperCase() === "GET") {
    return false;
  }
  if (SENSITIVE_PATH.test(path)) {
    return true;
  }
  const mutating = ["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase());
  return mutating && !fileHasAuth;
}

function lineHasAuth(line: string): boolean {
  return AUTH_HINT.test(line);
}

function endpointsFromText(
  content: string,
): { method: string; path: string; line: number; text: string }[] {
  const found: { method: string; path: string; line: number; text: string }[] = [];
  for (const row of sourceLines(content)) {
    if (isCodeComment(row.text)) {
      continue;
    }
    const match = ROUTE.exec(row.text);
    if (match === null || match[1] === undefined || match[3] === undefined) {
      continue;
    }
    found.push({
      method: match[1].toUpperCase(),
      path: match[3],
      line: row.line,
      text: row.text,
    });
  }
  return found;
}

export class AuthScanner implements VulnerabilityScanner {
  readonly id = "auth";

  scan(context: SecurityScanContext): VulnerabilityFinding[] {
    const findings: VulnerabilityFinding[] = [];
    for (const [path, content] of context.files) {
      if (!/\.(ts|js|tsx|jsx|mts|cts)$/i.test(path) || path.includes("node_modules/")) {
        continue;
      }
      const fileHasAuth = AUTH_HINT.test(content);
      const fromAnalysis =
        context.analysis?.documents
          .filter((document) => document.path === path)
          .flatMap((document) =>
            document.endpoints.map((endpoint) => ({
              method: endpoint.method,
              path: endpoint.path,
              line: endpoint.startLine,
              text: sourceLines(content)[endpoint.startLine - 1]?.text ?? "",
            })),
          ) ?? [];
      const endpoints = fromAnalysis.length > 0 ? fromAnalysis : endpointsFromText(content);
      for (const endpoint of endpoints) {
        if (!shouldFlagEndpoint(endpoint.method, endpoint.path, endpoint.text, fileHasAuth)) {
          continue;
        }
        findings.push(
          makeVulnerability({
            category: "auth",
            ruleId: "auth.unprotected-endpoint",
            severity: "high",
            title: "Endpoint missing authorization",
            message: `${endpoint.method} ${endpoint.path} does not apply an authentication or authorization check.`,
            path,
            startLine: endpoint.line,
            evidence: endpoint.text.trim(),
            cwe: "CWE-306",
          }),
        );
      }
      if (JWT_DECODE.test(content) && !JWT_VERIFY.test(content)) {
        const line = sourceLines(content).find((row) => JWT_DECODE.test(row.text));
        findings.push(
          makeVulnerability({
            category: "auth",
            ruleId: "auth.jwt-decode",
            severity: "high",
            title: "JWT decoded without verification",
            message: "jwt.decode is used without jwt.verify, so token signatures are not checked.",
            path,
            startLine: line?.line,
            evidence: line?.text.trim(),
            cwe: "CWE-347",
          }),
        );
      }
      for (const row of sourceLines(content)) {
        if (isCodeComment(row.text) || !AUTH_BYPASS.test(row.text)) {
          continue;
        }
        findings.push(
          makeVulnerability({
            category: "auth",
            ruleId: "auth.identity-bypass",
            severity: "critical",
            title: "Identity taken from request input",
            message: "User identity is assigned from query, body, or params without verification.",
            path,
            startLine: row.line,
            evidence: row.text.trim(),
            cwe: "CWE-287",
          }),
        );
      }
    }
    return findings;
  }
}

export function authScanner(): VulnerabilityScanner {
  return new AuthScanner();
}
