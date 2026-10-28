import { describe, expect, it } from "vitest";
import { chunkSource } from "../../src/rag/chunk.js";
import { cosineSimilarity, EmbeddingPipeline, HashingEmbedder } from "../../src/rag/embed.js";

describe("HashingEmbedder", () => {
  it("embeds similar text closer than unrelated text", async () => {
    const embedder = new HashingEmbedder(32);
    const [greet, hello, network] = await embedder.embed([
      "export function greet(name: string) { return name; }",
      "function greetUser(name) { return greet(name); }",
      "const socketTimeoutMs = 5000;",
    ]);
    expect(greet?.length).toBe(32);
    expect(cosineSimilarity(greet ?? [], hello ?? [])).toBeGreaterThan(
      cosineSimilarity(greet ?? [], network ?? []),
    );
  });
});

describe("EmbeddingPipeline", () => {
  it("attaches vectors to chunks", async () => {
    const chunks = chunkSource({
      path: "src/index.ts",
      content: "export function greet() { return 1; }\n",
      language: "TypeScript",
      fileKind: "source",
      repositoryFullName: "oktant/demo",
      commitSha: "abc",
      symbols: [{ name: "greet", kind: "function", startLine: 1, endLine: 1 }],
    });
    const embedded = await new EmbeddingPipeline(new HashingEmbedder(16)).embedChunks(chunks);
    expect(embedded).toHaveLength(1);
    expect(embedded[0]?.vector).toHaveLength(16);
    expect(embedded[0]?.symbol).toBe("greet");
  });
});
