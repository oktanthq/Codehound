import { describe, expect, it } from "vitest";
import { chunkSource } from "../../src/rag/chunk.js";
import { EmbeddingPipeline, HashingEmbedder } from "../../src/rag/embed.js";
import { SemanticSearcher } from "../../src/rag/semantic.js";
import { InMemoryVectorStore } from "../../src/rag/vector.js";

function chunks(path: string, content: string) {
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

describe("SemanticSearcher", () => {
  it("indexes chunks and retrieves by meaning", async () => {
    const searcher = new SemanticSearcher(
      new EmbeddingPipeline(new HashingEmbedder(48)),
      new InMemoryVectorStore(),
    );
    await searcher.index([
      ...chunks("src/greet.ts", "export function greet(name: string) { return name; }"),
      ...chunks("src/net.ts", "const socketTimeoutMs = 5000;"),
    ]);
    const hits = await searcher.search({ text: "greet a user by name", limit: 2 });
    expect(hits[0]?.chunk.path).toBe("src/greet.ts");
    expect(hits[0]?.source).toBe("semantic");
  });
});
