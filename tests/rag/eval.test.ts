import { describe, expect, it } from "vitest";
import { KeywordIndex } from "../../src/rag/bm25.js";
import { chunkSource } from "../../src/rag/chunk.js";
import { EmbeddingPipeline, HashingEmbedder } from "../../src/rag/embed.js";
import { evaluateRetriever, recallAtK, reciprocalRank } from "../../src/rag/eval.js";
import { HybridRetriever } from "../../src/rag/hybrid.js";
import { SemanticSearcher } from "../../src/rag/semantic.js";
import { InMemoryVectorStore } from "../../src/rag/vector.js";
import type { CodeChunk } from "../../src/rag/types.js";

function code(path: string, content: string, symbol: string): CodeChunk[] {
  return chunkSource({
    path,
    content,
    language: "TypeScript",
    fileKind: "source",
    repositoryFullName: "oktant/demo",
    commitSha: "abc",
    symbols: [{ name: symbol, kind: "function", startLine: 1, endLine: 1 }],
  });
}

describe("retrieval evaluation", () => {
  it("scores recall and reciprocal rank on a fixture corpus", async () => {
    const corpus = [
      ...code("src/greet.ts", "export function greet(name: string) { return name; }", "greet"),
      ...code("src/sum.ts", "export function sum(a: number, b: number) { return a + b; }", "sum"),
      ...code(
        "src/auth.ts",
        "export function verifyPassword(password: string) { return true; }",
        "verifyPassword",
      ),
    ];
    const keywords = new KeywordIndex();
    keywords.add(corpus);
    const semantic = new SemanticSearcher(
      new EmbeddingPipeline(new HashingEmbedder(48)),
      new InMemoryVectorStore(),
    );
    await semantic.index(corpus);
    const retriever = new HybridRetriever(semantic, keywords);
    const report = await evaluateRetriever(
      retriever,
      [
        {
          id: "greet",
          query: { text: "greet name", limit: 3 },
          relevant: [{ path: "src/greet.ts", symbol: "greet" }],
        },
        {
          id: "password",
          query: { text: "verify password", limit: 3 },
          relevant: [{ path: "src/auth.ts", symbol: "verifyPassword" }],
        },
      ],
      3,
    );
    expect(report.meanRecallAtK).toBeGreaterThan(0.5);
    expect(report.meanReciprocalRank).toBeGreaterThan(0.5);
    expect(recallAtK([], [{ path: "src/greet.ts", symbol: "greet" }], 1)).toBe(0);
    expect(reciprocalRank([], [{ path: "src/greet.ts", symbol: "greet" }])).toBe(0);
  });
});
