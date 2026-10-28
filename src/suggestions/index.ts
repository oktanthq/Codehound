export { generateSuggestions, pipelineStages } from "./pipeline.js";
export {
  suggestMultiFileChanges,
  suggestSingleFileChange,
  suggestCompanionTest,
} from "./generate.js";
export {
  architectureGuard,
  dependencyGuard,
  guardChange,
  rulePreservationGuard,
} from "./guards.js";
export { suggestionImpactPaths } from "./impact.js";
export { attachSuggestionsToReport, commentWithSuggestion } from "./integrate.js";
export { mapIssueToCode } from "./issue-map.js";
export { combinePatches, unifiedDiff } from "./patch.js";
export { suggestTestsForFindings } from "./tests.js";
export { validateChange, validateChanges } from "./validate.js";

export type {
  CodeLocation,
  Suggestion,
  SuggestionChange,
  SuggestionInput,
  SuggestionKind,
  SuggestionValidation,
} from "./types.js";
