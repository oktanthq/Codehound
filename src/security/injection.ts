import type { VulnerabilityScanner } from "./architecture.js";
import { collectTaint } from "./taint.js";
import { isCodeComment, sourceLines } from "./text.js";
import {
  makeVulnerability,
  type SecurityScanContext,
  type VulnSeverity,
  type VulnerabilityFinding,
} from "./types.js";

type InjectionRule = {
  id: string;
  title: string;
  message: string;
  severity: VulnSeverity;
  cwe: string;
  pattern: RegExp;
};

const RULES: InjectionRule[] = [
  {
    id: "injection.sql",
    title: "SQL injection",
    message: "SQL is concatenated or interpolated from untrusted input.",
    severity: "critical",
    cwe: "CWE-89",
    pattern:
      /\b(query|raw|execute)\s*\(\s*(`[^`]*\$\{|['"][^'"]*['"]\s*\+|`[^`]*(SELECT|INSERT|UPDATE|DELETE))/i,
  },
  {
    id: "injection.command",
    title: "Command injection",
    message: "A shell command is built from untrusted input.",
    severity: "critical",
    cwe: "CWE-78",
    pattern: /\b(execSync|execFileSync|exec|spawn)\s*\(\s*(`[^`]*\$\{|['"][^'"]*['"]\s*\+)/,
  },
  {
    id: "injection.path",
    title: "Path traversal",
    message: "A filesystem path is built from request input.",
    severity: "high",
    cwe: "CWE-22",
    pattern:
      /\b(readFileSync|writeFileSync|readFile|writeFile|createReadStream)\s*\(\s*(req\.|path\.join\([^)]*req\.)/,
  },
  {
    id: "injection.xss",
    title: "Cross-site scripting",
    message: "HTML is assigned from untrusted input.",
    severity: "high",
    cwe: "CWE-79",
    pattern: /\.(innerHTML|outerHTML)\s*=\s*(?!['"`])|\bdangerouslySetInnerHTML\s*=/,
  },
];

function taintedEnough(content: string, line: string): boolean {
  if (/\breq\.(body|query|params|headers)\b/.test(line) || /\$\{/.test(line) || /\+/.test(line)) {
    return true;
  }
  const { tainted } = collectTaint(content);
  return [...tainted].some((name) => new RegExp(`\\b${name}\\b`).test(line));
}

export class InjectionScanner implements VulnerabilityScanner {
  readonly id = "injection";

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
          if (!rule.pattern.test(row.text) || !taintedEnough(content, row.text)) {
            continue;
          }
          findings.push(
            makeVulnerability({
              category: "injection",
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

export function injectionScanner(): VulnerabilityScanner {
  return new InjectionScanner();
}
