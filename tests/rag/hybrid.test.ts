import { describe, expect, it } from "vitest";
import { KeywordIndex } from "../../src/rag/bm25.js";
import { chunkSource } from "../../src/rag/chunk.js";
import { EmbeddingPipeline, HashingEmbedder } from "../../src/rag/embed.js";
import { HybridRetriever, reciprocalRankFusion } from "../../src/rag/hybrid.js";
import { SemanticSearcher } from "../../src/rag/semantic.js";
import { InMemoryVectorStore } from "../../src/rag/vector.js";
import type { RetrievalHit } from "../../src/rag/types.js";

function hit(id: string, score: number): RetrievalHit {
  return {
    chunk: {
      id,
      path: `${id}.ts`,
      language: "TypeScript",
      fileKind: "source",
      kind: "block",
      symbol: undefined,
      symbolKind: undefined,
      startLine: 1,
      endLine: 1,
      text: id,
      repositoryFullName: "oktant/demo",
      commitSha: "abc",
    },
    score,
    source: "semantic",
  };
}

describe("reciprocalRankFusion", () => {
  it("promotes chunks that appear in both rankings", () => {
    const fused = reciprocalRankFusion(
      [
        [hit("a", 1), hit("b", 0.5)],
        [hit("b", 1), hit("c", 0.2)],
      ],
      3,
    );
    expect(fused[0]?.chunk.id).toBe("b");
    expect(fused[0]?.source).toBe("hybrid");
  });
});

describe("HybridRetriever", () => {
  it("returns hybrid hits for a mixed corpus", async () => {
    const chunks = [
      ...chunkSource({
        path: "src/greet.ts",
        content: "export function greet(name: string) { return `hello ${name}`; }",
        language: "TypeScript",
        fileKind: "source",
        repositoryFullName: "oktant/demo",
        commitSha: "abc",
        symbols: [{ name: "greet", kind: "function", startLine: 1, endLine: 1 }],
      }),
      ...chunkSource({
        path: "src/sum.ts",
        content: "export function sum(left: number, right: number) { return left + right; }",
        language: "TypeScript",
        fileKind: "source",
        repositoryFullName: "oktant/demo",
        commitSha: "abc",
        symbols: [{ name: "sum", kind: "function", startLine: 1, endLine: 1 }],
      }),
    ];
    const keywords = new KeywordIndex();
    keywords.add(chunks);
    const semantic = new SemanticSearcher(
      new EmbeddingPipeline(new HashingEmbedder(48)),
      new InMemoryVectorStore(),
    );
    await semantic.index(chunks);
    const hits = await new HybridRetriever(semantic, keywords).search({
      text: "greet name",
      limit: 2,
    });
    expect(hits[0]?.chunk.path).toBe("src/greet.ts");
    expect(hits[0]?.source).toBe("hybrid");
  });
});
