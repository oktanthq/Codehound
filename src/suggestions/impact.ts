import type { CimQueryLayer } from "../cim/query.js";
import type { SuggestionChange } from "./types.js";

export function suggestionImpactPaths(
  changes: readonly SuggestionChange[],
  query: CimQueryLayer | undefined,
): string[] {
  const paths = new Set(changes.map((change) => change.path));
  if (query === undefined) {
    return [...paths].sort();
  }
  for (const change of changes) {
    for (const edge of query.fileDependencies()) {
      if (edge.from === change.path || edge.to === change.path) {
        paths.add(edge.from);
        paths.add(edge.to);
      }
    }
  }
  return [...paths].sort();
}
