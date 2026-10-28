import { describe, expect, it } from "vitest";
import { KeywordIndex } from "../../src/rag/bm25.js";
import { chunkSource } from "../../src/rag/chunk.js";
import { EmbeddingPipeline, HashingEmbedder } from "../../src/rag/embed.js";
import { IncrementalIndexer } from "../../src/rag/incremental.js";
import { SemanticSearcher } from "../../src/rag/semantic.js";
import { InMemoryVectorStore } from "../../src/rag/vector.js";

function fileChunks(path: string, content: string) {
  return chunkSource({
    path,
    content,
    language: "TypeScript",
    fileKind: "source",
    repositoryFullName: "oktant/demo",
    commitSha: "abc",
    symbols: [],
  });
}

describe("IncrementalIndexer", () => {
  it("skips unchanged chunks and replaces edited files", async () => {
    const store = new InMemoryVectorStore();
    const keywords = new KeywordIndex();
    const semantic = new SemanticSearcher(new EmbeddingPipeline(new HashingEmbedder(16)), store);
    const indexer = new IncrementalIndexer(semantic, keywords, store);
    const first = fileChunks("src/a.ts", "export const n = 1;\n");
    const firstResult = await indexer.replacePath("src/a.ts", first);
    expect(firstResult.upserted).toBe(1);
    expect((await indexer.replacePath("src/a.ts", first)).unchanged).toBe(1);
    const updated = fileChunks("src/a.ts", "export const n = 2;\n");
    const second = await indexer.replacePath("src/a.ts", updated);
    expect(second.upserted).toBe(1);
    expect((await store.list())[0]?.text).toContain("n = 2");
  });
});
