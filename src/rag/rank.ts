import { symbolBoost } from "./symbol-search.js";
import { tokenize } from "./tokenize.js";
import type { RetrievalHit, RetrievalQuery, Retriever } from "./types.js";

export function pathBoost(hit: RetrievalHit, queryText: string): number {
  const path = hit.chunk.path.toLowerCase();
  const tokens = tokenize(queryText).filter((token) => token.length > 2);
  let boost = 0;
  for (const token of tokens) {
    if (path.includes(token)) {
      boost += 0.5;
    }
  }
  if (hit.chunk.kind === "symbol") {
    boost += 0.25;
  }
  return boost;
}

export function rerankHits(hits: readonly RetrievalHit[], query: RetrievalQuery): RetrievalHit[] {
  return hits
    .map((hit) => ({
      ...hit,
      score: hit.score + symbolBoost(hit, query.text) + pathBoost(hit, query.text),
    }))
    .sort((left, right) => right.score - left.score);
}

export class RerankingRetriever implements Retriever {
  constructor(private readonly inner: Retriever) {}

  async search(query: RetrievalQuery): Promise<RetrievalHit[]> {
    const limit = query.limit ?? 10;
    const hits = await this.inner.search({ ...query, limit: Math.max(limit * 3, 15) });
    return rerankHits(hits, query).slice(0, limit);
  }
}
