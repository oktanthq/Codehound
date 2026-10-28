import { describe, expect, it } from "vitest";
import { KeywordIndex } from "../../src/rag/bm25.js";
import { chunkSource } from "../../src/rag/chunk.js";

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

describe("KeywordIndex", () => {
  it("ranks chunks that contain the query terms first", () => {
    const index = new KeywordIndex();
    index.add([
      ...chunks(
        "src/auth.ts",
        "export function verifyPassword(password: string): boolean { return true; }",
      ),
      ...chunks("src/net.ts", "export function connectSocket(host: string): void {}"),
    ]);
    const hits = index.search({ text: "verify password", limit: 2 });
    expect(hits[0]?.chunk.path).toBe("src/auth.ts");
    expect(hits[0]?.source).toBe("keyword");
  });
});
