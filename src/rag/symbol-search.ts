import { tokenize } from "./tokenize.js";
import type { RetrievalHit, RetrievalQuery, Retriever } from "./types.js";

export function symbolBoost(hit: RetrievalHit, queryText: string): number {
  const symbol = hit.chunk.symbol;
  if (symbol === undefined) {
    return 0;
  }
  const queryTokens = new Set(tokenize(queryText));
  const symbolTokens = tokenize(symbol);
  const lower = symbol.toLowerCase();
  if (queryTokens.has(lower)) {
    return 3;
  }
  if (symbolTokens.some((token) => queryTokens.has(token))) {
    return 2;
  }
  if ([...queryTokens].some((token) => token.length > 2 && lower.includes(token))) {
    return 1;
  }
  return 0;
}

export class SymbolAwareRetriever implements Retriever {
  constructor(private readonly inner: Retriever) {}

  async search(query: RetrievalQuery): Promise<RetrievalHit[]> {
    const limit = query.limit ?? 10;
    const hits = await this.inner.search({ ...query, limit: Math.max(limit * 3, 15) });
    return hits
      .map((hit) => ({
        ...hit,
        score: hit.score + symbolBoost(hit, query.text),
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, limit);
  }
}
