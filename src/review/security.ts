import { addedLinesOf, makeFinding, type ReviewContext, type ReviewFinding } from "./findings.js";

type Pattern = {
  ruleId: string;
  title: string;
  message: string;
  severity: "medium" | "high" | "critical";
  pattern: RegExp;
};

const PATTERNS: Pattern[] = [
  {
    ruleId: "security.eval",
    title: "Dynamic evaluation",
    message: "Added code evaluates strings as programs (eval/new Function).",
    severity: "critical",
    pattern: /\beval\s*\(|\bnew\s+Function\s*\(/,
  },
  {
    ruleId: "security.xss",
    title: "HTML injection sink",
    message: "Added code assigns innerHTML or dangerouslySetInnerHTML.",
    severity: "high",
    pattern: /\binnerHTML\b|dangerouslySetInnerHTML/,
  },
  {
    ruleId: "security.shell",
    title: "Shell execution",
    message: "Added code shells out via child_process or execSync.",
    severity: "high",
    pattern: /\bchild_process\b|\bexecSync\s*\(|\bexec\s*\(/,
  },
  {
    ruleId: "security.secret",
    title: "Hardcoded secret",
    message: "Added code looks like a hardcoded password, token, or API key.",
    severity: "critical",
    pattern: /\b(?:password|passwd|secret|api[_-]?key|access[_-]?token)\b\s*[:=]\s*['"][^'"]+['"]/i,
  },
  {
    ruleId: "security.http",
    title: "Cleartext HTTP",
    message: "Added code uses http:// rather than https://.",
    severity: "medium",
    pattern: /http:\/\/(?!localhost|127\.0\.0\.1)/i,
  },
  {
    ruleId: "security.tls",
    title: "TLS verification disabled",
    message: "Added code disables TLS certificate verification.",
    severity: "high",
    pattern: /rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED/,
  },
];

export function detectSecurityRisks(context: ReviewContext): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  for (const diff of context.diffs) {
    for (const line of addedLinesOf(diff)) {
      for (const rule of PATTERNS) {
        if (!rule.pattern.test(line.text)) {
          continue;
        }
        findings.push(
          makeFinding({
            category: "security",
            ruleId: rule.ruleId,
            severity: rule.severity,
            title: rule.title,
            message: rule.message,
            path: diff.path,
            startLine: line.line,
            evidence: line.text.trim(),
          }),
        );
      }
    }
  }
  return findings;
}
