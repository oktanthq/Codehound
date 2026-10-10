import type { KeywordIndex } from "./bm25.js";
import type { SemanticSearcher } from "./semantic.js";
import type { RetrievalHit, RetrievalQuery } from "./types.js";

const RRF_K = 60;

export function reciprocalRankFusion(
  rankings: readonly RetrievalHit[][],
  limit: number,
): RetrievalHit[] {
  const scores = new Map<string, { hit: RetrievalHit; score: number }>();
  for (const ranking of rankings) {
    ranking.forEach((hit, index) => {
      const add = 1 / (RRF_K + index + 1);
      const current = scores.get(hit.chunk.id);
      if (current === undefined) {
        scores.set(hit.chunk.id, {
          hit: { ...hit, score: add, source: "hybrid" },
          score: add,
        });
      } else {
        current.score += add;
        current.hit = { ...current.hit, score: current.score, source: "hybrid" };
      }
    });
  }
  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(0, limit))
    .map((entry) => entry.hit);
}

export class HybridRetriever {
  constructor(
    private readonly semantic: SemanticSearcher,
    private readonly keywords: KeywordIndex,
  ) {}

  async search(query: RetrievalQuery): Promise<RetrievalHit[]> {
    const limit = query.limit ?? 10;
    const widened = { ...query, limit: Math.max(limit * 4, 20) };
    const [semanticHits, keywordHits] = await Promise.all([
      this.semantic.search(widened),
      Promise.resolve(this.keywords.search(widened)),
    ]);
    return reciprocalRankFusion([semanticHits, keywordHits], limit);
  }
}
