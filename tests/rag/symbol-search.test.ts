import { describe, expect, it } from "vitest";
import { symbolBoost, SymbolAwareRetriever } from "../../src/rag/symbol-search.js";
import type { RetrievalHit, Retriever } from "../../src/rag/types.js";

function hit(symbol: string | undefined, path: string, score: number): RetrievalHit {
  return {
    chunk: {
      id: path,
      path,
      language: "TypeScript",
      fileKind: "source",
      kind: symbol === undefined ? "block" : "symbol",
      symbol,
      symbolKind: symbol === undefined ? undefined : "function",
      startLine: 1,
      endLine: 1,
      text: symbol ?? path,
      repositoryFullName: "oktant/demo",
      commitSha: "abc",
    },
    score,
    source: "hybrid",
  };
}

describe("SymbolAwareRetriever", () => {
  it("boosts chunks whose symbol matches the query", async () => {
    const inner: Retriever = {
      async search() {
        return [hit("sum", "src/sum.ts", 1), hit("greet", "src/greet.ts", 1.1)];
      },
    };
    const hits = await new SymbolAwareRetriever(inner).search({ text: "greet user", limit: 2 });
    expect(hits[0]?.chunk.symbol).toBe("greet");
    expect(symbolBoost(hit("greet", "src/greet.ts", 0), "greet user")).toBeGreaterThan(0);
  });
});
