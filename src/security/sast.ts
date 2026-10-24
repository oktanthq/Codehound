import type { VulnerabilityScanner } from "./architecture.js";
import { isCodeComment, sourceLines } from "./text.js";
import {
  makeVulnerability,
  type SecurityScanContext,
  type VulnSeverity,
  type VulnerabilityFinding,
} from "./types.js";

export type SastRule = {
  id: string;
  title: string;
  message: string;
  severity: VulnSeverity;
  cwe: string | undefined;
  languages: readonly string[] | undefined;
  match: (line: string, path: string) => boolean;
};

function patternRule(
  id: string,
  title: string,
  message: string,
  severity: VulnSeverity,
  cwe: string,
  pattern: RegExp,
): SastRule {
  return {
    id,
    title,
    message,
    severity,
    cwe,
    languages: undefined,
    match: (line) => pattern.test(line),
  };
}

export const BUILTIN_SAST_RULES: SastRule[] = [
  patternRule(
    "sast.eval",
    "Dynamic code evaluation",
    "Code evaluates a string as a program (eval or new Function).",
    "critical",
    "CWE-95",
    /\beval\s*\(|\bnew\s+Function\s*\(/,
  ),
  patternRule(
    "sast.xss-html",
    "HTML injection sink",
    "Code assigns innerHTML, outerHTML, or dangerouslySetInnerHTML.",
    "high",
    "CWE-79",
    /\.(innerHTML|outerHTML)\s*=|\bdangerouslySetInnerHTML\b|\bdocument\.write\s*\(/,
  ),
  patternRule(
    "sast.command-exec",
    "OS command execution",
    "Code shells out via child_process exec/spawn.",
    "high",
    "CWE-78",
    /\b(execSync|execFileSync|spawnSync|execFile)\s*\(|\bchild_process\b|\bexec\s*\(/,
  ),
  patternRule(
    "sast.proto-pollution",
    "Prototype pollution sink",
    "Code writes __proto__ or constructor.prototype from attacker-controlled keys.",
    "high",
    "CWE-1321",
    /\['__proto__'\]|\["__proto__"\]|\.__proto__\s*=|\.constructor\.prototype\s*=/,
  ),
  patternRule(
    "sast.deserialize",
    "Unsafe deserialization",
    "Code deserializes untrusted data with node-serialize, unserialize, or YAML load.",
    "high",
    "CWE-502",
    /\bunserialize\s*\(|\bserialize\.unserialize\s*\(|\byaml\.load\s*\(/,
  ),
  patternRule(
    "sast.weak-tls",
    "TLS verification disabled",
    "Code disables TLS certificate verification.",
    "high",
    "CWE-295",
    /rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED/,
  ),
];

function languageOf(path: string): string | undefined {
  if (/\.(ts|tsx|mts|cts)$/i.test(path)) {
    return "TypeScript";
  }
  if (/\.(js|jsx|mjs|cjs)$/i.test(path)) {
    return "JavaScript";
  }
  return undefined;
}

export class SastRulesEngine implements VulnerabilityScanner {
  readonly id = "sast";
  private readonly rules: SastRule[] = [];

  constructor(rules: readonly SastRule[] = BUILTIN_SAST_RULES) {
    this.rules.push(...rules);
  }

  register(rule: SastRule): this {
    this.rules.push(rule);
    return this;
  }

  list(): readonly SastRule[] {
    return this.rules;
  }

  scanFile(path: string, content: string): VulnerabilityFinding[] {
    const language = languageOf(path);
    const findings: VulnerabilityFinding[] = [];
    for (const line of sourceLines(content)) {
      if (isCodeComment(line.text)) {
        continue;
      }
      for (const rule of this.rules) {
        if (
          rule.languages !== undefined &&
          language !== undefined &&
          !rule.languages.includes(language)
        ) {
          continue;
        }
        if (!rule.match(line.text, path)) {
          continue;
        }
        findings.push(
          makeVulnerability({
            category: "sast",
            ruleId: rule.id,
            severity: rule.severity,
            title: rule.title,
            message: rule.message,
            path,
            startLine: line.line,
            evidence: line.text.trim(),
            cwe: rule.cwe,
          }),
        );
      }
    }
    return findings;
  }

  scan(context: SecurityScanContext): VulnerabilityFinding[] {
    const findings: VulnerabilityFinding[] = [];
    for (const [path, content] of context.files) {
      if (path.endsWith("package.json") || path.includes("node_modules/")) {
        continue;
      }
      findings.push(...this.scanFile(path, content));
    }
    return findings;
  }
}

export function sastScanner(rules?: readonly SastRule[]): VulnerabilityScanner {
  return new SastRulesEngine(rules);
}
