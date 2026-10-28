import {
  addedLinesOf,
  joinAdded,
  makeFinding,
  type ReviewContext,
  type ReviewFinding,
} from "./findings.js";

const TODO = /\b(TODO|FIXME|HACK)\b/;
const MAGIC_NUMBER = /(?:^|[^\w.])(\d{3,})(?:[^\w]|$)/;
const ALLOWED_NUMBERS = new Set([
  "100",
  "200",
  "201",
  "204",
  "301",
  "302",
  "400",
  "401",
  "403",
  "404",
  "500",
]);
const EMPTY_CATCH = /catch\s*\((?:[^)]*)\)\s*\{\s*\}/s;
const DEEP_INDENT = /^(?:[ ]{16,}|\t{4,})\S/;
const LONG_HUNK_ADDS = 40;

export function detectCodeSmells(context: ReviewContext): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  for (const diff of context.diffs) {
    const added = addedLinesOf(diff);
    const joined = joinAdded(diff);

    for (const hunk of diff.hunks) {
      const addedInHunk = hunk.lines.filter((line) => line.kind === "add");
      if (addedInHunk.length > LONG_HUNK_ADDS) {
        findings.push(
          makeFinding({
            category: "smell",
            ruleId: "smell.long-hunk",
            severity: "medium",
            title: "Long added hunk",
            message: `This hunk adds ${addedInHunk.length} lines, which is hard to review.`,
            path: diff.path,
            startLine: addedInHunk[0]?.newLine,
            endLine: addedInHunk[addedInHunk.length - 1]?.newLine,
          }),
        );
      }
    }

    const todo = added.find((line) => TODO.test(line.text));
    if (todo !== undefined) {
      findings.push(
        makeFinding({
          category: "smell",
          ruleId: "smell.todo",
          severity: "info",
          title: "Leftover work marker",
          message: "Added code contains a TODO/FIXME/HACK marker.",
          path: diff.path,
          startLine: todo.line,
          evidence: todo.text.trim(),
        }),
      );
    }

    const magic = added.find((line) => {
      const match = MAGIC_NUMBER.exec(line.text);
      return match?.[1] !== undefined && !ALLOWED_NUMBERS.has(match[1]);
    });
    if (magic !== undefined) {
      findings.push(
        makeFinding({
          category: "smell",
          ruleId: "smell.magic-number",
          severity: "low",
          title: "Magic number",
          message: "Added code introduces an unexplained numeric literal.",
          path: diff.path,
          startLine: magic.line,
          evidence: magic.text.trim(),
        }),
      );
    }

    if (EMPTY_CATCH.test(joined)) {
      const catchLine = added.find((line) => /catch\s*\(/.test(line.text)) ?? added[0];
      findings.push(
        makeFinding({
          category: "smell",
          ruleId: "smell.empty-catch",
          severity: "medium",
          title: "Empty catch block",
          message: "Added code swallows errors without handling them.",
          path: diff.path,
          startLine: catchLine?.line,
          evidence: catchLine?.text.trim(),
        }),
      );
    }

    const nested = added.find((line) => DEEP_INDENT.test(line.text));
    if (nested !== undefined) {
      findings.push(
        makeFinding({
          category: "smell",
          ruleId: "smell.deep-nesting",
          severity: "low",
          title: "Deep nesting",
          message: "Added lines are nested more than four indentation levels.",
          path: diff.path,
          startLine: nested.line,
          evidence: nested.text.trim(),
        }),
      );
    }
  }
  return findings;
}
