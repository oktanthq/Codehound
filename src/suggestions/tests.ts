import type { ReviewFinding } from "../review/findings.js";
import { suggestCompanionTest, suggestSingleFileChange } from "./generate.js";
import type { AnalyzedFileDiff } from "../review/types.js";
import type { SuggestionChange } from "./types.js";

export function suggestTestsForFindings(
  findings: readonly ReviewFinding[],
  files: Map<string, string>,
  diffs: readonly AnalyzedFileDiff[],
): SuggestionChange[] {
  const changes: SuggestionChange[] = [];
  const seen = new Set<string>();
  for (const finding of findings) {
    const source =
      files.get(finding.path) ?? suggestSingleFileChange(finding, files, diffs)?.newText;
    const text = source ?? files.get(finding.path);
    if (text === undefined) {
      continue;
    }
    const test = suggestCompanionTest(finding.path, text, files);
    if (test === undefined || seen.has(test.path)) {
      continue;
    }
    seen.add(test.path);
    changes.push(test);
  }
  for (const [path, text] of files) {
    if (!path.startsWith("src/")) {
      continue;
    }
    const test = suggestCompanionTest(path, text, files);
    if (test === undefined || seen.has(test.path)) {
      continue;
    }
    seen.add(test.path);
    changes.push(test);
  }
  return changes;
}
