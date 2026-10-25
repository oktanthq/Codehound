import type { VulnerabilityScanner } from "./architecture.js";
import { sourceLines, stripQuotes } from "./text.js";
import {
  makeVulnerability,
  type SecurityScanContext,
  type VulnerabilityFinding,
} from "./types.js";

const PLACEHOLDER =
  /^(changeme|change-me|placeholder|your[_-]?api[_-]?key|xxx+|todo|example|sample|dummy|secret|password|token)$/i;

const SKIP_PATH = /(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|node_modules\/|\.md$)/i;

type SecretPattern = {
  id: string;
  title: string;
  message: string;
  cwe: string;
  pattern: RegExp;
};

const PATTERNS: SecretPattern[] = [
  {
    id: "secret.aws-access-key",
    title: "AWS access key",
    message: "Line contains an AWS access key id.",
    cwe: "CWE-798",
    pattern: /\bAKIA[0-9A-Z]{16}\b/,
  },
  {
    id: "secret.github-token",
    title: "GitHub token",
    message: "Line contains a GitHub personal access token.",
    cwe: "CWE-798",
    pattern: /\b(ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{22,})\b/,
  },
  {
    id: "secret.private-key",
    title: "Private key material",
    message: "Line contains PEM private key armor.",
    cwe: "CWE-321",
    pattern: /-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----/,
  },
  {
    id: "secret.jwt",
    title: "Embedded JWT",
    message: "Line contains a compact JWT.",
    cwe: "CWE-798",
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
  },
  {
    id: "secret.stripe",
    title: "Stripe secret key",
    message: "Line contains a Stripe live secret key.",
    cwe: "CWE-798",
    pattern: /\bsk_live_[A-Za-z0-9]{16,}\b/,
  },
  {
    id: "secret.connection-string",
    title: "Credential in connection string",
    message: "Line embeds a username and password in a database URL.",
    cwe: "CWE-798",
    pattern: /\b(?:postgres|mysql|mongodb|redis|amqp):\/\/[^:\s]+:[^@\s]+@/i,
  },
];

const ASSIGNMENT =
  /\b(password|passwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token|private[_-]?key)\b\s*[:=]\s*(['"`][^'"`]+['"`])/i;

const HIGH_ENTROPY = /(['"`])([A-Za-z0-9/+_.=-]{20,})\1/;

function shannonEntropy(value: string): number {
  const counts = new Map<string, number>();
  for (const char of value) {
    counts.set(char, (counts.get(char) ?? 0) + 1);
  }
  let entropy = 0;
  for (const count of counts.values()) {
    const probability = count / value.length;
    entropy -= probability * Math.log2(probability);
  }
  return entropy;
}

function looksLikePlaceholder(value: string): boolean {
  const inner = stripQuotes(value);
  if (inner.length === 0 || PLACEHOLDER.test(inner)) {
    return true;
  }
  if (/^process\.env\b/.test(inner) || /\$\{/.test(inner)) {
    return true;
  }
  return false;
}

function skipPath(path: string): boolean {
  return SKIP_PATH.test(path);
}

export class SecretScanner implements VulnerabilityScanner {
  readonly id = "secret";

  scan(context: SecurityScanContext): VulnerabilityFinding[] {
    const findings: VulnerabilityFinding[] = [];
    for (const [path, content] of context.files) {
      if (skipPath(path)) {
        continue;
      }
      for (const line of sourceLines(content)) {
        for (const rule of PATTERNS) {
          if (!rule.pattern.test(line.text)) {
            continue;
          }
          findings.push(
            makeVulnerability({
              category: "secret",
              ruleId: rule.id,
              severity: "critical",
              title: rule.title,
              message: rule.message,
              path,
              startLine: line.line,
              evidence: line.text.trim(),
              cwe: rule.cwe,
            }),
          );
        }
        const assigned = ASSIGNMENT.exec(line.text);
        if (assigned !== null && assigned[2] !== undefined && !looksLikePlaceholder(assigned[2])) {
          findings.push(
            makeVulnerability({
              category: "secret",
              ruleId: "secret.hardcoded",
              severity: "critical",
              title: "Hardcoded credential",
              message: "Sensitive value is assigned a string literal rather than an environment variable.",
              path,
              startLine: line.line,
              evidence: line.text.trim(),
              cwe: "CWE-798",
            }),
          );
        }
        const entropyMatch = HIGH_ENTROPY.exec(line.text);
        if (
          entropyMatch !== null &&
          entropyMatch[2] !== undefined &&
          shannonEntropy(entropyMatch[2]) >= 4 &&
          !looksLikePlaceholder(entropyMatch[2]) &&
          !line.text.includes("from ")
        ) {
          findings.push(
            makeVulnerability({
              category: "secret",
              ruleId: "secret.high-entropy",
              severity: "high",
              title: "High-entropy secret",
              message: "Quoted string looks like a randomly generated credential.",
              path,
              startLine: line.line,
              evidence: line.text.trim(),
              cwe: "CWE-798",
            }),
          );
        }
      }
    }
    return findings;
  }
}

export function secretScanner(): VulnerabilityScanner {
  return new SecretScanner();
}

export { shannonEntropy };
