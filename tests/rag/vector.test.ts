import { describe, expect, it } from "vitest";
import { chunkSource } from "../../src/rag/chunk.js";
import { EmbeddingPipeline, HashingEmbedder } from "../../src/rag/embed.js";
import { InMemoryVectorStore } from "../../src/rag/vector.js";

async function embed(content: string, path = "src/index.ts") {
  const chunks = chunkSource({
    path,
    content,
    language: "TypeScript",
    fileKind: "source",
    repositoryFullName: "oktant/demo",
    commitSha: "abc",
    symbols: [],
  });
  return new EmbeddingPipeline(new HashingEmbedder(32)).embedChunks(chunks);
}

describe("InMemoryVectorStore", () => {
  it("upserts chunks and returns nearest neighbors", async () => {
    const store = new InMemoryVectorStore();
    const greet = await embed(
      "export function greet(name: string) { return name; }",
      "src/greet.ts",
    );
    const timeout = await embed("const socketTimeoutMs = 5000;", "src/net.ts");
    await store.upsert([...greet, ...timeout]);
    const query = greet[0]?.vector ?? [];
    const hits = await store.query(query, 2);
    expect(hits[0]?.chunk.path).toBe("src/greet.ts");
    expect(hits[0]?.score ?? 0).toBeGreaterThan(hits[1]?.score ?? 0);
  });

  it("filters and deletes by path", async () => {
    const store = new InMemoryVectorStore();
    await store.upsert(await embed("export const a = 1;", "src/a.ts"));
    await store.upsert(await embed("export const b = 2;", "src/b.ts"));
    expect(
      (await store.query([1], 10, { pathPrefix: "src/a" })).map((hit) => hit.chunk.path),
    ).toEqual(["src/a.ts"]);
    expect(await store.deleteByPath("src/a.ts")).toBe(1);
    expect(await store.list()).toHaveLength(1);
  });
});
