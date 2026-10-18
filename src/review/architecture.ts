import { layerForPath } from "../cim/from-analysis.js";
import { addedLinesOf, makeFinding, type ReviewContext, type ReviewFinding } from "./findings.js";

const IMPORT_FROM = /from\s+["']([^"']+)["']/;

function importedPath(fromPath: string, specifier: string): string | undefined {
  if (!specifier.startsWith(".")) {
    return undefined;
  }
  const parts = fromPath.split("/");
  parts.pop();
  for (const segment of specifier.split("/")) {
    if (segment === "." || segment.length === 0) {
      continue;
    }
    if (segment === "..") {
      parts.pop();
      continue;
    }
    parts.push(segment);
  }
  return parts.join("/");
}

export function detectArchitectureViolations(context: ReviewContext): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  for (const diff of context.diffs) {
    const fromLayer = layerForPath(diff.path);
    for (const line of addedLinesOf(diff)) {
      const match = IMPORT_FROM.exec(line.text);
      const specifier = match?.[1];
      if (specifier === undefined) {
        continue;
      }
      const resolved = importedPath(diff.path, specifier) ?? specifier;
      const importsTests = specifier.includes("tests/") || resolved.startsWith("tests/");
      if (fromLayer === "application" && importsTests) {
        findings.push(
          makeFinding({
            category: "architecture",
            ruleId: "architecture.test-import",
            severity: "high",
            title: "Application imports tests",
            message: `${diff.path} (application layer) imports test code via ${specifier}.`,
            path: diff.path,
            startLine: line.line,
            evidence: line.text.trim(),
          }),
        );
        continue;
      }
      const toLayer = layerForPath(resolved);
      if (fromLayer === "application" && toLayer === "test") {
        findings.push(
          makeFinding({
            category: "architecture",
            ruleId: "architecture.layer-violation",
            severity: "high",
            title: "Forbidden layer dependency",
            message: `Application code must not depend on the ${toLayer} layer.`,
            path: diff.path,
            startLine: line.line,
            evidence: line.text.trim(),
          }),
        );
      }
    }

    if (context.query !== undefined) {
      const outgoing = context.query.fileDependencies().filter((edge) => edge.from === diff.path);
      for (const edge of outgoing) {
        if (layerForPath(edge.from) === "application" && layerForPath(edge.to) === "test") {
          findings.push(
            makeFinding({
              category: "architecture",
              ruleId: "architecture.layer-violation",
              severity: "high",
              title: "Forbidden layer dependency",
              message: `${edge.from} depends on test file ${edge.to}.`,
              path: diff.path,
              evidence: `${edge.from} -> ${edge.to}`,
            }),
          );
        }
      }
    }
  }
  return findings;
}
