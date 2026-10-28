import type { AnalysisDocument, DataFlowEdge } from "../analysis/types.js";
import { isCodeComment, sourceLines } from "./text.js";

export type TaintSourceHit = {
  name: string;
  line: number;
  text: string;
  kind: string;
};

export type TaintSinkHit = {
  id: string;
  line: number;
  text: string;
  cwe: string;
  title: string;
};

export const TAINT_SOURCE_PATTERNS: { kind: string; pattern: RegExp }[] = [
  { kind: "http-input", pattern: /\breq\.(body|query|params|headers|cookies|ip)\b/ },
  { kind: "location", pattern: /\b(window\.)?location\.(search|hash|href)\b/ },
  { kind: "dom", pattern: /\bdocument\.(cookie|URL|referrer)\b/ },
  { kind: "argv", pattern: /\bprocess\.argv\b/ },
];

export const TAINT_SINK_PATTERNS: {
  id: string;
  title: string;
  cwe: string;
  pattern: RegExp;
}[] = [
  {
    id: "eval",
    title: "Dynamic evaluation",
    cwe: "CWE-95",
    pattern: /\beval\s*\(|\bnew\s+Function\s*\(/,
  },
  {
    id: "exec",
    title: "Command execution",
    cwe: "CWE-78",
    pattern: /\b(execSync|execFileSync|spawnSync|execFile|exec|spawn)\s*\(/,
  },
  {
    id: "html",
    title: "HTML sink",
    cwe: "CWE-79",
    pattern: /\.(innerHTML|outerHTML)\s*=|\bdangerouslySetInnerHTML\b|\bdocument\.write\s*\(/,
  },
  {
    id: "sql",
    title: "Query sink",
    cwe: "CWE-89",
    pattern: /\b(query|raw|execute|execSQL)\s*\(/,
  },
  {
    id: "path",
    title: "Filesystem sink",
    cwe: "CWE-22",
    pattern:
      /\b(readFileSync|writeFileSync|readFile|writeFile|createReadStream|createWriteStream)\s*\(/,
  },
];

const ASSIGN = /^\s*(?:const|let|var)?\s*([A-Za-z_$][\w$]*)\s*=\s*(.+)$/;
const DESTRUCTURE = /^\s*(?:const|let|var)\s*\{([^}]+)\}\s*=\s*(.+)$/;

function isSourceText(text: string): boolean {
  return TAINT_SOURCE_PATTERNS.some((source) => source.pattern.test(text));
}

function identifierMentions(text: string, names: ReadonlySet<string>): boolean {
  for (const name of names) {
    const pattern = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
    if (pattern.test(text)) {
      return true;
    }
  }
  return false;
}

export function collectTaint(content: string): {
  tainted: Set<string>;
  sources: TaintSourceHit[];
  sinks: TaintSinkHit[];
} {
  const tainted = new Set<string>();
  const sources: TaintSourceHit[] = [];
  const sinks: TaintSinkHit[] = [];

  for (const row of sourceLines(content)) {
    if (isCodeComment(row.text)) {
      continue;
    }
    for (const source of TAINT_SOURCE_PATTERNS) {
      if (source.pattern.test(row.text)) {
        sources.push({ name: source.kind, line: row.line, text: row.text, kind: source.kind });
      }
    }
    const destructure = DESTRUCTURE.exec(row.text);
    if (destructure !== null && destructure[1] !== undefined && destructure[2] !== undefined) {
      if (isSourceText(destructure[2]) || identifierMentions(destructure[2], tainted)) {
        for (const part of destructure[1].split(",")) {
          const name = part.split(":")[0]?.trim();
          if (name !== undefined && name.length > 0) {
            tainted.add(name);
          }
        }
      }
    }
    const assign = ASSIGN.exec(row.text);
    if (assign !== null && assign[1] !== undefined && assign[2] !== undefined) {
      if (isSourceText(assign[2]) || identifierMentions(assign[2], tainted)) {
        tainted.add(assign[1]);
      }
    }
    for (const sink of TAINT_SINK_PATTERNS) {
      if (!sink.pattern.test(row.text)) {
        continue;
      }
      if (isSourceText(row.text) || identifierMentions(row.text, tainted)) {
        sinks.push({
          id: sink.id,
          line: row.line,
          text: row.text,
          cwe: sink.cwe,
          title: sink.title,
        });
      }
    }
  }
  return { tainted, sources, sinks };
}

export function taintFromAnalysis(document: AnalysisDocument, content: string): Set<string> {
  const tainted = collectTaint(content).tainted;
  const edges: DataFlowEdge[] = [...document.dataFlows];
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of edges) {
      if (tainted.has(edge.from) && !tainted.has(edge.to)) {
        tainted.add(edge.to);
        changed = true;
      }
    }
  }
  return tainted;
}

export function fileHasTaintSources(content: string): boolean {
  return collectTaint(content).sources.length > 0;
}

export function fileHasTaintSinks(content: string): TaintSinkHit[] {
  const sinks: TaintSinkHit[] = [];
  for (const row of sourceLines(content)) {
    if (isCodeComment(row.text)) {
      continue;
    }
    for (const sink of TAINT_SINK_PATTERNS) {
      if (sink.pattern.test(row.text)) {
        sinks.push({
          id: sink.id,
          line: row.line,
          text: row.text,
          cwe: sink.cwe,
          title: sink.title,
        });
      }
    }
  }
  return sinks;
}
