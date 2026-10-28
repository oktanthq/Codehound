import type { ReviewFinding } from "../review/findings.js";
import { addedLinesOf } from "../review/findings.js";
import type { AnalyzedFileDiff } from "../review/types.js";
import type { SuggestionChange } from "./types.js";

function rewriteLine(ruleId: string, line: string): string | undefined {
  if (ruleId === "practice.console" && /\bconsole\.(log|debug|info|warn|error)\s*\(/.test(line)) {
    return undefined;
  }
  if (ruleId === "practice.debugger" && /\bdebugger\b/.test(line)) {
    return undefined;
  }
  if (ruleId === "smell.todo" && /\b(TODO|FIXME|HACK)\b/.test(line)) {
    return undefined;
  }
  if (ruleId === "practice.var") {
    return line.replace(/^(\s*)var\s+/, "$1let ");
  }
  if (ruleId === "practice.eqeq") {
    return line
      .replaceAll("!==", "§NE§")
      .replaceAll("===", "§EQ§")
      .replaceAll("!=", "!==")
      .replaceAll("==", "===")
      .replaceAll("§NE§", "!==")
      .replaceAll("§EQ§", "===");
  }
  if (ruleId === "practice.any") {
    return line.replaceAll(/:\s*any\b/g, ": unknown");
  }
  if (ruleId === "security.eval") {
    return line.replaceAll(/\beval\s*\(/g, "JSON.parse(");
  }
  return line;
}

export function suggestSingleFileChange(
  finding: ReviewFinding,
  files: Map<string, string>,
  diffs: readonly AnalyzedFileDiff[],
): SuggestionChange | undefined {
  const current =
    files.get(finding.path) ??
    diffs
      .filter((diff) => diff.path === finding.path)
      .flatMap((diff) => addedLinesOf(diff).map((line) => line.text))
      .join("\n");
  if (current.length === 0) {
    return undefined;
  }
  const next = current
    .split("\n")
    .map((line) => rewriteLine(finding.ruleId, line))
    .filter((line): line is string => line !== undefined)
    .join("\n");
  if (next === current) {
    return undefined;
  }
  return {
    path: finding.path,
    oldText: current,
    newText: next.endsWith("\n") || current.endsWith("\n") === false ? next : `${next}\n`,
    description: `Apply local fix for ${finding.ruleId}`,
  };
}

const EXPORTED_FN = /export\s+(?:async\s+)?function\s+(\w+)/;

export function suggestCompanionTest(
  path: string,
  sourceText: string,
  files: Map<string, string>,
): SuggestionChange | undefined {
  if (!path.startsWith("src/") || !path.endsWith(".ts")) {
    return undefined;
  }
  const names = [...sourceText.matchAll(new RegExp(EXPORTED_FN, "g"))].map(
    (match) => match[1] ?? "",
  );
  const name = names[0];
  if (name === undefined || name.length === 0) {
    return undefined;
  }
  const testPath = `tests/${path.slice("src/".length).replace(/\.ts$/, ".test.ts")}`;
  if (files.has(testPath)) {
    return undefined;
  }
  const specifier = `../${path.replace(/\.ts$/, ".js")}`;
  const newText = `import { ${name} } from "${specifier}";\n\nexport function test${name}() {\n  return ${name};\n}\n`;
  return {
    path: testPath,
    oldText: "",
    newText,
    description: `Add a test module for ${name}`,
  };
}

export function suggestMultiFileChanges(
  finding: ReviewFinding,
  files: Map<string, string>,
  diffs: readonly AnalyzedFileDiff[],
): SuggestionChange[] {
  const primary = suggestSingleFileChange(finding, files, diffs);
  if (primary === undefined) {
    return [];
  }
  const test = suggestCompanionTest(primary.path, primary.newText, files);
  return test === undefined ? [primary] : [primary, test];
}
