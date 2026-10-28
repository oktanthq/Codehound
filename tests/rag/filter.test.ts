import { describe, expect, it } from "vitest";
import { applyRetrievalFilter, FilteringRetriever } from "../../src/rag/filter.js";
import type { RetrievalHit, Retriever } from "../../src/rag/types.js";

function hit(path: string, language: string): RetrievalHit {
  return {
    chunk: {
      id: path,
      path,
      language,
      fileKind: "source",
      kind: "block",
      symbol: undefined,
      symbolKind: undefined,
      startLine: 1,
      endLine: 1,
      text: path,
      repositoryFullName: "oktant/demo",
      commitSha: "abc",
    },
    score: 1,
    source: "hybrid",
  };
}

describe("applyRetrievalFilter", () => {
  it("keeps hits that match repository, language, and path prefix", () => {
    const hits = applyRetrievalFilter([hit("src/a.ts", "TypeScript"), hit("lib/b.py", "Python")], {
      text: "unused",
      language: "TypeScript",
      pathPrefix: "src/",
    });
    expect(hits.map((item) => item.chunk.path)).toEqual(["src/a.ts"]);
  });
});

describe("FilteringRetriever", () => {
  it("applies metadata filters after an inner search", async () => {
    const inner: Retriever = {
      async search() {
        return [hit("src/a.ts", "TypeScript"), hit("src/b.py", "Python")];
      },
    };
    const hits = await new FilteringRetriever(inner).search({
      text: "code",
      language: "Python",
      limit: 5,
    });
    expect(hits.map((item) => item.chunk.path)).toEqual(["src/b.py"]);
  });
});
