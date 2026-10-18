import { isRuleName } from "../cim/rules.js";
import {
  addedLinesOf,
  deletedLinesOf,
  makeFinding,
  type ReviewContext,
  type ReviewFinding,
} from "./findings.js";

const EXPORTED_FN = /export\s+(?:async\s+)?function\s+(\w+)/;

export function detectRuleViolations(context: ReviewContext): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  for (const diff of context.diffs) {
    const deleted = deletedLinesOf(diff);
    const added = addedLinesOf(diff);
    const addedNames = new Set(
      added.flatMap((line) => {
        const match = EXPORTED_FN.exec(line.text);
        return match?.[1] === undefined ? [] : [match[1]];
      }),
    );

    for (const line of deleted) {
      const match = EXPORTED_FN.exec(line.text);
      const name = match?.[1];
      if (name === undefined || !isRuleName(name)) {
        continue;
      }
      if (addedNames.has(name)) {
        continue;
      }
      findings.push(
        makeFinding({
          category: "rule",
          ruleId: "rule.removed",
          severity: "high",
          title: "Business rule removed",
          message: `Exported rule ${name} was deleted without a replacement.`,
          path: diff.path,
          startLine: added[0]?.line,
          evidence: line.text.trim(),
        }),
      );
    }

    const addedCalls = added.map((line) => line.text).join("\n");
    const cimRules = context.query?.rules().filter((rule) => rule.path === diff.path) ?? [];
    for (const rule of cimRules) {
      const mentioned = addedCalls.includes(rule.name) || addedNames.has(rule.name);
      const newExport = [...addedNames].find((name) => !isRuleName(name));
      if (
        !mentioned &&
        newExport !== undefined &&
        deleted.some((line) => line.text.includes(rule.name))
      ) {
        findings.push(
          makeFinding({
            category: "rule",
            ruleId: "rule.bypassed",
            severity: "medium",
            title: "Business rule bypassed",
            message: `New export ${newExport} lands in a file governed by ${rule.name} after that rule was edited out of the change.`,
            path: diff.path,
            evidence: rule.name,
          }),
        );
      }
    }
  }
  return findings;
}
