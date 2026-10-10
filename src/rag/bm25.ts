import { tokenize } from "./tokenize.js";
import type { CodeChunk, RetrievalHit, RetrievalQuery } from "./types.js";
import { filterFromQuery, matchesFilter } from "./vector.js";

const K1 = 1.2;
const B = 0.75;

type IndexedChunk = {
  chunk: CodeChunk;
  tf: Map<string, number>;
  length: number;
};

export class KeywordIndex {
  private readonly chunks = new Map<string, IndexedChunk>();
  private readonly df = new Map<string, number>();

  add(chunks: readonly CodeChunk[]): void {
    for (const chunk of chunks) {
      this.removeId(chunk.id);
      const tokens = tokenize(chunk.text);
      const tf = new Map<string, number>();
      for (const token of tokens) {
        tf.set(token, (tf.get(token) ?? 0) + 1);
      }
      for (const token of tf.keys()) {
        this.df.set(token, (this.df.get(token) ?? 0) + 1);
      }
      this.chunks.set(chunk.id, { chunk, tf, length: Math.max(1, tokens.length) });
    }
  }

  removeByPath(path: string): void {
    for (const [id, item] of this.chunks) {
      if (item.chunk.path === path) {
        this.removeId(id);
      }
    }
  }

  removeId(id: string): void {
    const existing = this.chunks.get(id);
    if (existing === undefined) {
      return;
    }
    for (const token of existing.tf.keys()) {
      const next = (this.df.get(token) ?? 1) - 1;
      if (next <= 0) {
        this.df.delete(token);
      } else {
        this.df.set(token, next);
      }
    }
    this.chunks.delete(id);
  }

  search(query: RetrievalQuery): RetrievalHit[] {
    const terms = tokenize(query.text);
    if (terms.length === 0 || this.chunks.size === 0) {
      return [];
    }
    const filter = filterFromQuery(query);
    const limit = query.limit ?? 10;
    const avgLength =
      [...this.chunks.values()].reduce((sum, item) => sum + item.length, 0) / this.chunks.size;
    const documentCount = this.chunks.size;
    const hits: RetrievalHit[] = [];
    for (const item of this.chunks.values()) {
      if (!matchesFilter(item.chunk, filter)) {
        continue;
      }
      let score = 0;
      for (const term of terms) {
        const tf = item.tf.get(term) ?? 0;
        if (tf === 0) {
          continue;
        }
        const df = this.df.get(term) ?? 0;
        const idf = Math.log((documentCount - df + 0.5) / (df + 0.5) + 1);
        const denom = tf + K1 * (1 - B + B * (item.length / avgLength));
        score += idf * ((tf * (K1 + 1)) / denom);
      }
      if (score > 0) {
        hits.push({ chunk: item.chunk, score, source: "keyword" });
      }
    }
    hits.sort((a, b) => b.score - a.score);
    return hits.slice(0, Math.max(0, limit));
  }

  size(): number {
    return this.chunks.size;
  }
}
