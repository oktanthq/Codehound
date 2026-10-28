import { addedLinesOf, makeFinding, type ReviewContext, type ReviewFinding } from "./findings.js";

const CONSOLE = /\bconsole\.(log|debug|info|warn|error)\s*\(/;
const DEBUGGER = /\bdebugger\b/;
const VAR_DECL = /^\s*var\s+\w/;
const ANY_TYPE = /:\s*any\b/;
const TS_IGNORE = /@ts-ignore|@ts-nocheck/;
const EQEQ = /(?:^|[^=!<>])==(?:[^=]|$)/;
const NEQ = /(?:^|[^=!])!=(?:[^=]|$)/;

export function detectBadPractices(context: ReviewContext): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  for (const diff of context.diffs) {
    if (
      diff.path.startsWith("tests/") ||
      diff.path.includes(".test.") ||
      diff.path.includes(".spec.")
    ) {
      continue;
    }
    for (const line of addedLinesOf(diff)) {
      const text = line.text;
      const common = {
        category: "practice" as const,
        path: diff.path,
        startLine: line.line,
        evidence: text.trim(),
      };
      if (CONSOLE.test(text)) {
        findings.push(
          makeFinding({
            ...common,
            ruleId: "practice.console",
            severity: "low",
            title: "Console usage",
            message: "Added production code calls console, which is noisy in shipped logs.",
          }),
        );
      }
      if (DEBUGGER.test(text)) {
        findings.push(
          makeFinding({
            ...common,
            ruleId: "practice.debugger",
            severity: "medium",
            title: "Debugger statement",
            message: "Added code contains a debugger statement.",
          }),
        );
      }
      if (VAR_DECL.test(text)) {
        findings.push(
          makeFinding({
            ...common,
            ruleId: "practice.var",
            severity: "low",
            title: "var declaration",
            message: "Added code uses var; prefer const or let.",
          }),
        );
      }
      if (ANY_TYPE.test(text)) {
        findings.push(
          makeFinding({
            ...common,
            ruleId: "practice.any",
            severity: "low",
            title: "any type",
            message: "Added code uses the any type, which hides type errors.",
          }),
        );
      }
      if (TS_IGNORE.test(text)) {
        findings.push(
          makeFinding({
            ...common,
            ruleId: "practice.ts-ignore",
            severity: "medium",
            title: "Type suppression",
            message: "Added code suppresses TypeScript diagnostics.",
          }),
        );
      }
      if (EQEQ.test(text) || NEQ.test(text)) {
        findings.push(
          makeFinding({
            ...common,
            ruleId: "practice.eqeq",
            severity: "low",
            title: "Loose equality",
            message: "Added code uses == or !=; prefer === or !==.",
          }),
        );
      }
    }
  }
  return findings;
}
