import type { EmbeddingPipeline } from "./embed.js";
import type { CodeChunk, RetrievalHit, RetrievalQuery } from "./types.js";
import { filterFromQuery, type VectorStore } from "./vector.js";

export class SemanticSearcher {
  constructor(
    private readonly pipeline: EmbeddingPipeline,
    private readonly store: VectorStore,
  ) {}

  async index(chunks: readonly CodeChunk[]): Promise<void> {
    const embedded = await this.pipeline.embedChunks(chunks);
    await this.store.upsert(embedded);
  }

  async search(query: RetrievalQuery): Promise<RetrievalHit[]> {
    const vector = await this.pipeline.embedQuery(query.text);
    return this.store.query(vector, query.limit ?? 10, filterFromQuery(query));
  }
}
