import type { RetrievalHit, RetrievalQuery, Retriever } from "./types.js";

export type RelevantChunk = {
  path: string;
  symbol: string | undefined;
};

export type RetrievalEvalCase = {
  id: string;
  query: RetrievalQuery;
  relevant: RelevantChunk[];
};

export type RetrievalEvalScores = {
  id: string;
  recallAtK: number;
  reciprocalRank: number;
};

export function isRelevant(hit: RetrievalHit, relevant: readonly RelevantChunk[]): boolean {
  return relevant.some((item) => {
    if (item.path !== hit.chunk.path) {
      return false;
    }
    if (item.symbol === undefined) {
      return true;
    }
    return hit.chunk.symbol === item.symbol;
  });
}

export function recallAtK(
  hits: readonly RetrievalHit[],
  relevant: readonly RelevantChunk[],
  k: number,
): number {
  if (relevant.length === 0) {
    return 0;
  }
  const found = hits.slice(0, k).filter((hit) => isRelevant(hit, relevant));
  const unique = new Set(found.map((hit) => `${hit.chunk.path}:${hit.chunk.symbol ?? ""}`));
  return unique.size / relevant.length;
}

export function reciprocalRank(
  hits: readonly RetrievalHit[],
  relevant: readonly RelevantChunk[],
): number {
  const index = hits.findIndex((hit) => isRelevant(hit, relevant));
  if (index < 0) {
    return 0;
  }
  return 1 / (index + 1);
}

export async function evaluateRetriever(
  retriever: Retriever,
  cases: readonly RetrievalEvalCase[],
  k = 5,
): Promise<{ cases: RetrievalEvalScores[]; meanRecallAtK: number; meanReciprocalRank: number }> {
  const scores: RetrievalEvalScores[] = [];
  for (const testCase of cases) {
    const hits = await retriever.search({ ...testCase.query, limit: k });
    scores.push({
      id: testCase.id,
      recallAtK: recallAtK(hits, testCase.relevant, k),
      reciprocalRank: reciprocalRank(hits, testCase.relevant),
    });
  }
  const meanRecallAtK =
    scores.reduce((sum, item) => sum + item.recallAtK, 0) / Math.max(1, scores.length);
  const meanReciprocalRank =
    scores.reduce((sum, item) => sum + item.reciprocalRank, 0) / Math.max(1, scores.length);
  return { cases: scores, meanRecallAtK, meanReciprocalRank };
}
