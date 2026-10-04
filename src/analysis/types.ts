import type { FileKind } from "../github/languages.js";

export type AnalysisFile = {
  path: string;
  language: string | undefined;
  kind: FileKind;
  content: string | undefined;
};

export type AnalysisContext = {
  repositoryFullName: string;
  commitSha: string;
  ref: string;
};

export type AnalysisSymbol = {
  name: string;
  kind: string;
  startLine: number;
  endLine: number;
};

export type AnalysisImport = {
  source: string;
  kind: "import" | "export" | "require" | "dynamic";
};

export type AnalysisDocument = {
  path: string;
  language: string;
  adapterId: string;
  symbols: AnalysisSymbol[];
  imports: AnalysisImport[];
};

export type SkipReason =
  "undetected-language" | "unsupported-language" | "adapter-failed" | "empty-file";

export type SkippedFile = {
  path: string;
  language: string | undefined;
  reason: SkipReason;
  message: string | undefined;
};

export type AnalysisRun = {
  context: AnalysisContext;
  documents: AnalysisDocument[];
  skipped: SkippedFile[];
};
