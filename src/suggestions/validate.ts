import { formatDiagnostics, parseTypeScript } from "../analysis/parse.js";
import type { CimQueryLayer } from "../cim/query.js";
import { guardChange } from "./guards.js";
import type { SuggestionChange, SuggestionValidation } from "./types.js";

export function validateChange(
  change: SuggestionChange,
  query: CimQueryLayer | undefined,
): SuggestionValidation {
  const problems = [...guardChange(change, query)];
  if (change.path.endsWith(".ts") || change.path.endsWith(".tsx") || change.path.endsWith(".js")) {
    const parsed = parseTypeScript(change.path, change.newText, "TypeScript");
    if (parsed.diagnostics.length > 0) {
      problems.push(`Parse failed in ${change.path}: ${formatDiagnostics(parsed.diagnostics)}`);
    }
  }
  if (change.newText.includes("\u0000")) {
    problems.push(`${change.path} contains a NUL byte`);
  }
  return { ok: problems.length === 0, problems };
}

export function validateChanges(
  changes: readonly SuggestionChange[],
  query: CimQueryLayer | undefined,
): SuggestionValidation {
  const problems = changes.flatMap((change) => validateChange(change, query).problems);
  return { ok: problems.length === 0, problems };
}
