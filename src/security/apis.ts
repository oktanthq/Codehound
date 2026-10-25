import type { VulnerabilityScanner } from "./architecture.js";
import { isCodeComment, sourceLines } from "./text.js";
import {
  makeVulnerability,
  type SecurityScanContext,
  type VulnSeverity,
  type VulnerabilityFinding,
} from "./types.js";

type ApiRule = {
  id: string;
  title: string;
  message: string;
  severity: VulnSeverity;
  cwe: string;
  pattern: RegExp;
};

const RULES: ApiRule[] = [
  {
    id: "api.weak-hash",
    title: "Weak cryptographic hash",
    message: "MD5 or SHA-1 is not suitable for passwords or integrity of untrusted data.",
    severity: "high",
    cwe: "CWE-328",
    pattern: /\bcreateHash\s*\(\s*['"](?:md5|sha1)['"]\s*\)|\b(md5|sha1)\s*\(/i,
  },
  {
    id: "api.insecure-random",
    title: "Insecure random for a secret",
    message: "Math.random is used to build a token, secret, or session identifier.",
    severity: "high",
    cwe: "CWE-338",
    pattern: /\bMath\.random\s*\(/,
  },
  {
    id: "api.cleartext-http",
    title: "Cleartext HTTP",
    message: "Code uses http:// rather than https://.",
    severity: "medium",
    cwe: "CWE-319",
    pattern: /http:\/\/(?!localhost|127\.0\.0\.1)/i,
  },
  {
    id: "api.legacy-buffer",
    title: "Unsafe Buffer constructor",
    message: "new Buffer is unpooled and can leak memory; use Buffer.from or Buffer.alloc.",
    severity: "medium",
    cwe: "CWE-119",
    pattern: /\bnew\s+Buffer\s*\(/,
  },
  {
    id: "api.legacy-cipher",
    title: "Deprecated cipher API",
    message: "createCipher is deprecated; use createCipheriv with an explicit IV.",
    severity: "high",
    cwe: "CWE-327",
    pattern: /\bcreateCipher\s*\(/,
  },
  {
    id: "api.cors-any",
    title: "CORS allows any origin",
    message: "Cross-origin resource sharing is configured with origin *.",
    severity: "medium",
    cwe: "CWE-942",
    pattern: /\borigin\s*:\s*['"]\*['"]|\bAccess-Control-Allow-Origin['"]?\s*,\s*['"]\*/,
  },
  {
    id: "api.cookie-flags",
    title: "Cookie without httpOnly",
    message: "A cookie is set with httpOnly disabled.",
    severity: "medium",
    cwe: "CWE-1004",
    pattern: /httpOnly\s*:\s*false/,
  },
  {
    id: "api.shell-true",
    title: "Shell spawning enabled",
    message: "child_process is invoked with shell: true.",
    severity: "high",
    cwe: "CWE-78",
    pattern: /shell\s*:\s*true/,
  },
];

function shouldKeep(rule: ApiRule, line: string, content: string): boolean {
  if (rule.id === "api.insecure-random") {
    return /\b(token|secret|session|password|nonce|otp|key)\b/i.test(line) ||
      /\b(token|secret|session)\b/i.test(content);
  }
  return true;
}

export class InsecureApiScanner implements VulnerabilityScanner {
  readonly id = "insecure-api";

  scan(context: SecurityScanContext): VulnerabilityFinding[] {
    const findings: VulnerabilityFinding[] = [];
    for (const [path, content] of context.files) {
      if (!/\.(ts|js|tsx|jsx|mts|cts)$/i.test(path) || path.includes("node_modules/")) {
        continue;
      }
      for (const row of sourceLines(content)) {
        if (isCodeComment(row.text)) {
          continue;
        }
        for (const rule of RULES) {
          if (!rule.pattern.test(row.text) || !shouldKeep(rule, row.text, content)) {
            continue;
          }
          findings.push(
            makeVulnerability({
              category: "insecure-api",
              ruleId: rule.id,
              severity: rule.severity,
              title: rule.title,
              message: rule.message,
              path,
              startLine: row.line,
              evidence: row.text.trim(),
              cwe: rule.cwe,
            }),
          );
        }
      }
    }
    return findings;
  }
}

export function insecureApiScanner(): VulnerabilityScanner {
  return new InsecureApiScanner();
}
