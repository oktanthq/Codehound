import type { ReviewFinding } from "../review/findings.js";
import type { CimQueryLayer } from "../cim/query.js";
import type { AnalyzedFileDiff } from "../review/types.js";
import type { Retriever } from "../rag/types.js";

export type SuggestionKind = "single-file" | "multi-file" | "test";

export type SuggestionChange = {
  path: string;
  oldText: string;
  newText: string;
  description: string;
};

export type SuggestionValidation = {
  ok: boolean;
  problems: string[];
};

export type Suggestion = {
  id: string;
  title: string;
  kind: SuggestionKind;
  findingId: string | undefined;
  changes: SuggestionChange[];
  patch: string;
  impactPaths: string[];
  validation: SuggestionValidation;
};

export type SuggestionInput = {
  findings: ReviewFinding[];
  diffs: AnalyzedFileDiff[];
  files: Map<string, string>;
  query?: CimQueryLayer;
  retriever?: Retriever;
};

export type CodeLocation = {
  path: string;
  startLine?: number;
  symbol?: string;
  score: number;
};
