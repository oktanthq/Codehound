import type { IngestedFile } from "../github/walk.js";
import type { AnalysisFile } from "./types.js";

export function analysisFilesFromIngest(
  files: readonly IngestedFile[],
  contents: ReadonlyMap<string, string> = new Map(),
): AnalysisFile[] {
  return files.map((file) => ({
    path: file.path,
    language: file.language,
    kind: file.kind,
    content: contents.get(file.path),
  }));
}
