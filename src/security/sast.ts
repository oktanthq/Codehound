import { extractImportBindings, type ImportBinding } from "../analysis/imports.js";
import { parseTypeScript } from "../analysis/parse.js";
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
  match: (line: string, path: string, content?: string) => boolean;
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

const CHILD_PROCESS_MODULES = new Set(["child_process", "node:child_process"]);
const CHILD_PROCESS_COMMANDS = [
  "exec",
  "execSync",
  "execFile",
  "execFileSync",
  "spawn",
  "spawnSync",
  "fork",
] as const;
const BARE_IMPORTED_COMMANDS = new Set([
  "exec",
  "execSync",
  "execFile",
  "execFileSync",
  "spawnSync",
]);
const MEMBER_COMMANDS = CHILD_PROCESS_COMMANDS.join("|");
const DISTINCTIVE_COMMAND = /\b(execSync|execFileSync|spawnSync|execFile)\s*\(/;
const BARE_EXEC = /(?<![\w.])exec\s*\(/;
const REQUIRE_CHILD_PROCESS_CALL =
  /require\s*\(\s*['"](?:node:)?child_process['"]\s*\)\s*\.\s*[A-Za-z_$][\w$]*\s*\(/;
const CHILD_PROCESS_MEMBER_CALL = /\bchild_process\s*\.\s*[A-Za-z_$][\w$]*\s*\(/;
const CP_ALIAS_CALL = new RegExp(`\\bcp\\s*\\.\\s*(?:${MEMBER_COMMANDS})\\s*\\(`);

type ChildProcessBindings = {
  commands: ReadonlySet<string>;
  modules: ReadonlySet<string>;
};

type BindingsCache = {
  path: string;
  content: string;
  bindings: ChildProcessBindings;
};

let bindingsCache: BindingsCache | undefined;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isChildProcessModule(source: string): boolean {
  return CHILD_PROCESS_MODULES.has(source);
}

function bindingsFromImports(imports: readonly ImportBinding[]): ChildProcessBindings {
  const commands = new Set<string>();
  const modules = new Set<string>(["child_process"]);
  for (const binding of imports) {
    if (!isChildProcessModule(binding.source)) {
      continue;
    }
    if (binding.imported === "*" || binding.imported === "default") {
      modules.add(binding.local);
    } else if (BARE_IMPORTED_COMMANDS.has(binding.imported)) {
      commands.add(binding.local);
    }
  }
  return { commands, modules };
}

function commandExecBindings(path: string, content: string): ChildProcessBindings {
  const language = languageOf(path);
  if (language === undefined || content.length === 0) {
    return { commands: new Set(), modules: new Set(["child_process"]) };
  }
  const parsed = parseTypeScript(path, content, language);
  return bindingsFromImports(extractImportBindings(parsed.sourceFile));
}

function cachedCommandExecBindings(path: string, content: string): ChildProcessBindings {
  if (
    bindingsCache !== undefined &&
    bindingsCache.path === path &&
    bindingsCache.content === content
  ) {
    return bindingsCache.bindings;
  }
  const bindings = commandExecBindings(path, content);
  bindingsCache = { path, content, bindings };
  return bindings;
}

function commandExecFallback(line: string): boolean {
  return (
    DISTINCTIVE_COMMAND.test(line) ||
    BARE_EXEC.test(line) ||
    REQUIRE_CHILD_PROCESS_CALL.test(line) ||
    CHILD_PROCESS_MEMBER_CALL.test(line) ||
    CP_ALIAS_CALL.test(line)
  );
}

function commandExecFromBindings(line: string, bindings: ChildProcessBindings): boolean {
  for (const name of bindings.commands) {
    if (new RegExp(`(?<![\\w.])${escapeRegExp(name)}\\s*\\(`).test(line)) {
      return true;
    }
  }
  for (const name of bindings.modules) {
    if (new RegExp(`\\b${escapeRegExp(name)}\\s*\\.\\s*(?:${MEMBER_COMMANDS})\\s*\\(`).test(line)) {
      return true;
    }
  }
  return false;
}

function matchesCommandExec(line: string, path: string, content = ""): boolean {
  if (commandExecFallback(line)) {
    return true;
  }
  return commandExecFromBindings(line, cachedCommandExecBindings(path, content));
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
  {
    id: "sast.command-exec",
    title: "OS command execution",
    message: "Code shells out via child_process exec/spawn.",
    severity: "high",
    cwe: "CWE-78",
    languages: undefined,
    match: matchesCommandExec,
  },
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
        if (!rule.match(line.text, path, content)) {
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
