import { suggestMultiFileChanges, suggestSingleFileChange } from "./generate.js";
import { suggestionImpactPaths } from "./impact.js";
import { combinePatches, unifiedDiff } from "./patch.js";
import { suggestTestsForFindings } from "./tests.js";
import type { Suggestion, SuggestionChange, SuggestionInput } from "./types.js";
import { validateChanges } from "./validate.js";

function suggestionFromChanges(
  id: string,
  title: string,
  kind: Suggestion["kind"],
  findingId: string | undefined,
  changes: SuggestionChange[],
  query: SuggestionInput["query"],
): Suggestion | undefined {
  if (changes.length === 0) {
    return undefined;
  }
  const patch = combinePatches(
    changes.map((change) => unifiedDiff(change.path, change.oldText, change.newText)),
  );
  if (patch.length === 0) {
    return undefined;
  }
  const suggestion: Suggestion = {
    id,
    title,
    kind,
    findingId,
    changes,
    patch,
    impactPaths: suggestionImpactPaths(changes, query),
    validation: validateChanges(changes, query),
  };
  return suggestion;
}

export function generateSuggestions(input: SuggestionInput): Suggestion[] {
  const suggestions: Suggestion[] = [];
  const used = new Set<string>();

  for (const finding of input.findings) {
    const single = suggestSingleFileChange(finding, input.files, input.diffs);
    if (single !== undefined) {
      const built = suggestionFromChanges(
        `single:${finding.id}`,
        `Fix ${finding.ruleId} in ${finding.path}`,
        "single-file",
        finding.id,
        [single],
        input.query,
      );
      if (built !== undefined) {
        suggestions.push(built);
        used.add(finding.path);
      }
    }
    const multi = suggestMultiFileChanges(finding, input.files, input.diffs);
    if (multi.length > 1) {
      const built = suggestionFromChanges(
        `multi:${finding.id}`,
        `Fix ${finding.ruleId} and update related files`,
        "multi-file",
        finding.id,
        multi,
        input.query,
      );
      if (built !== undefined) {
        suggestions.push(built);
      }
    }
  }

  const tests = suggestTestsForFindings(input.findings, input.files, input.diffs).filter(
    (change) => !used.has(change.path),
  );
  const testSuggestion = suggestionFromChanges(
    "tests:generated",
    "Add tests for changed modules",
    "test",
    undefined,
    tests,
    input.query,
  );
  if (testSuggestion !== undefined) {
    suggestions.push(testSuggestion);
  }
  return suggestions;
}

export function pipelineStages(): string[] {
  return [
    "map-issue",
    "generate-single-file",
    "generate-multi-file",
    "dependency-guard",
    "architecture-guard",
    "rule-preservation",
    "emit-patch",
    "suggest-tests",
    "impact",
    "validate",
  ];
}
