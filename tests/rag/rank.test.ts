import { describe, expect, it } from "vitest";
import { pathBoost, rerankHits } from "../../src/rag/rank.js";
import type { RetrievalHit } from "../../src/rag/types.js";

function hit(path: string, symbol: string | undefined, score: number): RetrievalHit {
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

describe("rerankHits", () => {
  it("promotes symbol and path matches", () => {
    const ranked = rerankHits([hit("src/math.ts", "sum", 1), hit("src/greet.ts", "greet", 1)], {
      text: "greet helper",
    });
    expect(ranked[0]?.chunk.path).toBe("src/greet.ts");
    expect(pathBoost(hit("src/greet.ts", "greet", 0), "greet helper")).toBeGreaterThan(0);
  });
});
