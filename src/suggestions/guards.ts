import { layerForPath } from "../cim/from-analysis.js";
import { isRuleName } from "../cim/rules.js";
import type { CimQueryLayer } from "../cim/query.js";
import type { SuggestionChange } from "./types.js";

const EXPORTED = /export\s+(?:async\s+)?(?:function|const|class)\s+(\w+)/g;
const IMPORT_FROM = /from\s+["']([^"']+)["']/g;

function exportedNames(text: string): Set<string> {
  return new Set(
    [...text.matchAll(EXPORTED)].flatMap((match) => (match[1] === undefined ? [] : [match[1]])),
  );
}

export function dependencyGuard(
  change: SuggestionChange,
  query: CimQueryLayer | undefined,
): string | undefined {
  if (query === undefined) {
    return undefined;
  }
  const removed = [...exportedNames(change.oldText)].filter(
    (name) => !exportedNames(change.newText).has(name),
  );
  if (removed.length === 0) {
    return undefined;
  }
  const dependents = query.fileDependencies().filter((edge) => edge.to === change.path);
  if (dependents.length === 0) {
    return undefined;
  }
  return `Cannot drop export(s) ${removed.join(", ")} from ${change.path}; dependents: ${dependents.map((edge) => edge.from).join(", ")}`;
}

export function architectureGuard(change: SuggestionChange): string | undefined {
  if (layerForPath(change.path) !== "application") {
    return undefined;
  }
  for (const match of change.newText.matchAll(IMPORT_FROM)) {
    const specifier = match[1] ?? "";
    if (specifier.includes("tests/")) {
      return `${change.path} would import test code via ${specifier}`;
    }
  }
  return undefined;
}

export function rulePreservationGuard(change: SuggestionChange): string | undefined {
  const oldRules = [...exportedNames(change.oldText)].filter((name) => isRuleName(name));
  const newRules = exportedNames(change.newText);
  const missing = oldRules.filter((name) => !newRules.has(name));
  if (missing.length === 0) {
    return undefined;
  }
  return `Change drops business rule(s) ${missing.join(", ")}`;
}

export function guardChange(change: SuggestionChange, query: CimQueryLayer | undefined): string[] {
  return [
    dependencyGuard(change, query),
    architectureGuard(change),
    rulePreservationGuard(change),
  ].flatMap((problem) => (problem === undefined ? [] : [problem]));
}
