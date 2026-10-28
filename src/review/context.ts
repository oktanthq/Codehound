import type { Retriever, RetrievalHit } from "../rag/types.js";
import type { AnalyzedFileDiff } from "./types.js";

export type ChangedCodeContext = {
  path: string;
  status: string;
  addedLines: number[];
  hits: RetrievalHit[];
};

function overlaps(hit: RetrievalHit, lines: readonly number[]): boolean {
  if (lines.length === 0) {
    return true;
  }
  return lines.some((line) => line >= hit.chunk.startLine && line <= hit.chunk.endLine);
}

export async function retrieveChangedCodeContext(
  retriever: Retriever,
  diffs: readonly AnalyzedFileDiff[],
  repositoryFullName: string,
  limitPerFile = 4,
): Promise<ChangedCodeContext[]> {
  const results: ChangedCodeContext[] = [];
  for (const diff of diffs) {
    const hits = await retriever.search({
      text: `${diff.path} ${diff.hunks.map((hunk) => hunk.header).join(" ")}`.trim(),
      repositoryFullName,
      pathPrefix: diff.path,
      limit: Math.max(limitPerFile * 2, 6),
    });
    const overlapping = hits.filter((hit) => overlaps(hit, diff.addedLines)).slice(0, limitPerFile);
    results.push({
      path: diff.path,
      status: diff.status,
      addedLines: diff.addedLines,
      hits: overlapping.length > 0 ? overlapping : hits.slice(0, limitPerFile),
    });
  }
  return results;
}
