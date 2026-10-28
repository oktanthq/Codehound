import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { AnalysisFile } from "./types.js";

export async function loadAnalysisContents(
  root: string,
  files: readonly AnalysisFile[],
): Promise<AnalysisFile[]> {
  const loaded: AnalysisFile[] = [];
  for (const file of files) {
    if (file.content !== undefined) {
      loaded.push(file);
      continue;
    }
    try {
      const content = await readFile(join(root, file.path), "utf8");
      loaded.push({ ...file, content });
    } catch {
      loaded.push(file);
    }
  }
  return loaded;
}
