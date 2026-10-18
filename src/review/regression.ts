import { deletedLinesOf, makeFinding, type ReviewContext, type ReviewFinding } from "./findings.js";

const EXPORTED = /export\s+(?:async\s+)?(?:function|const|class|type|interface)\s+(\w+)/;
const FAN_IN = 2;

function isTestPath(path: string): boolean {
  return path.startsWith("tests/") || path.includes(".test.") || path.includes(".spec.");
}

export function detectRegressionRisk(context: ReviewContext): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  for (const diff of context.diffs) {
    const impact = context.impact.find((item) => item.path === diff.path);
    if ((impact?.dependents.length ?? 0) >= FAN_IN) {
      findings.push(
        makeFinding({
          category: "regression",
          ruleId: "regression.fan-in",
          severity: "high",
          title: "High fan-in change",
          message: `${diff.path} has ${impact?.dependents.length ?? 0} dependents; regressions here spread widely.`,
          path: diff.path,
          evidence: impact?.dependents.map((edge) => edge.from).join(", "),
        }),
      );
    }

    if (diff.status === "removed" && isTestPath(diff.path)) {
      findings.push(
        makeFinding({
          category: "regression",
          ruleId: "regression.test-removed",
          severity: "medium",
          title: "Test file removed",
          message: `Test coverage in ${diff.path} was deleted.`,
          path: diff.path,
        }),
      );
    }

    for (const line of deletedLinesOf(diff)) {
      const match = EXPORTED.exec(line.text);
      if (match?.[1] === undefined) {
        continue;
      }
      findings.push(
        makeFinding({
          category: "regression",
          ruleId: "regression.export-removed",
          severity: "high",
          title: "Exported symbol removed",
          message: `Export ${match[1]} was deleted; callers may break.`,
          path: diff.path,
          evidence: line.text.trim(),
        }),
      );
    }

    if (isTestPath(diff.path) && diff.deletedLines.length >= 8 && diff.addedLines.length === 0) {
      findings.push(
        makeFinding({
          category: "regression",
          ruleId: "regression.test-removed",
          severity: "medium",
          title: "Test assertions removed",
          message: `${diff.path} deletes ${diff.deletedLines.length} lines without replacements.`,
          path: diff.path,
        }),
      );
    }
  }
  return findings;
}
