import { cosineSimilarity } from "./embed.js";
import type { ChunkKind, EmbeddedChunk, RetrievalHit } from "./types.js";

export type VectorFilter = {
  repositoryFullName?: string;
  commitSha?: string;
  language?: string;
  pathPrefix?: string;
  symbol?: string;
  symbolKind?: string;
  chunkKind?: ChunkKind;
};

export type VectorStore = {
  upsert: (chunks: readonly EmbeddedChunk[]) => Promise<void>;
  deleteById: (id: string) => Promise<boolean>;
  deleteByPath: (path: string) => Promise<number>;
  deleteByRepository: (fullName: string, commitSha: string | undefined) => Promise<number>;
  get: (id: string) => Promise<EmbeddedChunk | undefined>;
  list: () => Promise<EmbeddedChunk[]>;
  query: (
    vector: readonly number[],
    limit: number,
    filter?: VectorFilter,
  ) => Promise<RetrievalHit[]>;
};

function matchesFilter(chunk: EmbeddedChunk, filter: VectorFilter | undefined): boolean {
  if (filter === undefined) {
    return true;
  }
  if (
    filter.repositoryFullName !== undefined &&
    chunk.repositoryFullName?.toLowerCase() !== filter.repositoryFullName.toLowerCase()
  ) {
    return false;
  }
  if (filter.commitSha !== undefined && chunk.commitSha !== filter.commitSha) {
    return false;
  }
  if (filter.language !== undefined && chunk.language !== filter.language) {
    return false;
  }
  if (filter.pathPrefix !== undefined && !chunk.path.startsWith(filter.pathPrefix)) {
    return false;
  }
  if (filter.symbol !== undefined && chunk.symbol !== filter.symbol) {
    return false;
  }
  if (filter.symbolKind !== undefined && chunk.symbolKind !== filter.symbolKind) {
    return false;
  }
  if (filter.chunkKind !== undefined && chunk.kind !== filter.chunkKind) {
    return false;
  }
  return true;
}

export class InMemoryVectorStore implements VectorStore {
  private readonly items = new Map<string, EmbeddedChunk>();

  async upsert(chunks: readonly EmbeddedChunk[]): Promise<void> {
    for (const chunk of chunks) {
      this.items.set(chunk.id, chunk);
    }
  }

  async deleteById(id: string): Promise<boolean> {
    return this.items.delete(id);
  }

  async deleteByPath(path: string): Promise<number> {
    let removed = 0;
    for (const [id, chunk] of this.items) {
      if (chunk.path === path) {
        this.items.delete(id);
        removed += 1;
      }
    }
    return removed;
  }

  async deleteByRepository(fullName: string, commitSha: string | undefined): Promise<number> {
    const normalized = fullName.toLowerCase();
    let removed = 0;
    for (const [id, chunk] of this.items) {
      if (chunk.repositoryFullName?.toLowerCase() !== normalized) {
        continue;
      }
      if (commitSha !== undefined && chunk.commitSha !== commitSha) {
        continue;
      }
      this.items.delete(id);
      removed += 1;
    }
    return removed;
  }

  async get(id: string): Promise<EmbeddedChunk | undefined> {
    return this.items.get(id);
  }

  async list(): Promise<EmbeddedChunk[]> {
    return [...this.items.values()];
  }

  async query(
    vector: readonly number[],
    limit: number,
    filter?: VectorFilter,
  ): Promise<RetrievalHit[]> {
    const hits: RetrievalHit[] = [];
    for (const chunk of this.items.values()) {
      if (!matchesFilter(chunk, filter)) {
        continue;
      }
      hits.push({
        chunk,
        score: cosineSimilarity(vector, chunk.vector),
        source: "semantic",
      });
    }
    hits.sort((a, b) => b.score - a.score);
    return hits.slice(0, Math.max(0, limit));
  }
}

export { matchesFilter };
