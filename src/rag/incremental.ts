import { createHash } from "node:crypto";
import type { KeywordIndex } from "./bm25.js";
import type { SemanticSearcher } from "./semantic.js";
import type { CodeChunk } from "./types.js";
import type { VectorStore } from "./vector.js";

export function chunkDigest(chunk: CodeChunk): string {
  return createHash("sha256")
    .update(`${chunk.path}\0${chunk.startLine}\0${chunk.endLine}\0${chunk.text}`)
    .digest("hex");
}

export type IndexUpdateResult = {
  upserted: number;
  removed: number;
  unchanged: number;
};

export class IncrementalIndexer {
  private readonly digests = new Map<string, string>();

  constructor(
    private readonly semantic: SemanticSearcher,
    private readonly keywords: KeywordIndex,
    private readonly store: VectorStore,
  ) {}

  async replacePath(path: string, chunks: readonly CodeChunk[]): Promise<IndexUpdateResult> {
    const incoming = chunks.filter((chunk) => chunk.path === path);
    const existing = (await this.store.list()).filter((chunk) => chunk.path === path);
    const incomingById = new Map(incoming.map((chunk) => [chunk.id, chunk]));
    let unchanged = 0;
    const toUpsert: CodeChunk[] = [];
    for (const chunk of incoming) {
      const digest = chunkDigest(chunk);
      if (this.digests.get(chunk.id) === digest) {
        unchanged += 1;
      } else {
        toUpsert.push(chunk);
        this.digests.set(chunk.id, digest);
      }
    }
    let removed = 0;
    for (const chunk of existing) {
      if (!incomingById.has(chunk.id)) {
        await this.store.deleteById(chunk.id);
        this.keywords.removeId(chunk.id);
        this.digests.delete(chunk.id);
        removed += 1;
      }
    }
    if (toUpsert.length > 0) {
      await this.semantic.index(toUpsert);
      this.keywords.add(toUpsert);
    }
    return { upserted: toUpsert.length, removed, unchanged };
  }

  async replaceRepository(
    fullName: string,
    commitSha: string,
    chunks: readonly CodeChunk[],
  ): Promise<IndexUpdateResult> {
    const existing = (await this.store.list()).filter(
      (chunk) =>
        chunk.repositoryFullName?.toLowerCase() === fullName.toLowerCase() &&
        chunk.commitSha !== commitSha,
    );
    let removed = 0;
    for (const chunk of existing) {
      await this.store.deleteById(chunk.id);
      this.keywords.removeId(chunk.id);
      this.digests.delete(chunk.id);
      removed += 1;
    }
    const byPath = new Map<string, CodeChunk[]>();
    for (const chunk of chunks) {
      const list = byPath.get(chunk.path) ?? [];
      list.push(chunk);
      byPath.set(chunk.path, list);
    }
    let upserted = 0;
    let unchanged = 0;
    for (const [path, pathChunks] of byPath) {
      const result = await this.replacePath(path, pathChunks);
      upserted += result.upserted;
      unchanged += result.unchanged;
      removed += result.removed;
    }
    return { upserted, removed, unchanged };
  }
}
