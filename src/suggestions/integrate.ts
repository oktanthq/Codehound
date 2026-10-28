import type { ReviewComment } from "../review/comments.js";
import type { ReviewReport } from "../review/engine.js";
import type { Suggestion } from "./types.js";

export function commentWithSuggestion(
  comment: ReviewComment,
  suggestion: Suggestion,
): ReviewComment {
  const fence = ["", "Suggested change:", "", "```diff", suggestion.patch.trimEnd(), "```"].join(
    "\n",
  );
  return {
    ...comment,
    body: `${comment.body}\n${fence}`,
  };
}

export function attachSuggestionsToReport(
  report: ReviewReport,
  suggestions: readonly Suggestion[],
): ReviewReport {
  const byFinding = new Map<string, Suggestion>();
  for (const suggestion of suggestions) {
    if (suggestion.findingId === undefined || !suggestion.validation.ok) {
      continue;
    }
    if (!byFinding.has(suggestion.findingId)) {
      byFinding.set(suggestion.findingId, suggestion);
    }
  }
  const comments = report.comments.map((comment) => {
    const match = comment.findingIds
      .map((id) => byFinding.get(id))
      .find((suggestion) => suggestion !== undefined);
    return match === undefined ? comment : commentWithSuggestion(comment, match);
  });
  return { ...report, comments };
}
