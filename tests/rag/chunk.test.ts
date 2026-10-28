import { describe, expect, it } from "vitest";
import { chunkSource } from "../../src/rag/chunk.js";
import type { ChunkSource } from "../../src/rag/types.js";

function source(
  partial: Partial<ChunkSource> & Pick<ChunkSource, "path" | "content">,
): ChunkSource {
  return {
    language: "TypeScript",
    fileKind: "source",
    repositoryFullName: "oktant/demo",
    commitSha: "abc",
    symbols: [],
    ...partial,
  };
}

describe("chunkSource", () => {
  it("splits a file on symbol ranges and keeps a preamble", () => {
    const content = [
      'import { x } from "./x.js";',
      "export function greet(name: string): string {",
      "  return name;",
      "}",
      "export function run(): void {}",
    ].join("\n");
    const chunks = chunkSource(
      source({
        path: "src/index.ts",
        content,
        symbols: [
          { name: "greet", kind: "function", startLine: 2, endLine: 4 },
          { name: "run", kind: "function", startLine: 5, endLine: 5 },
        ],
      }),
    );
    expect(
      chunks.map((chunk) => ({
        kind: chunk.kind,
        symbol: chunk.symbol,
        startLine: chunk.startLine,
      })),
    ).toEqual([
      { kind: "preamble", symbol: undefined, startLine: 1 },
      { kind: "symbol", symbol: "greet", startLine: 2 },
      { kind: "symbol", symbol: "run", startLine: 5 },
    ]);
    expect(chunks[1]?.text).toContain("function greet");
  });

  it("windows files that have no symbols", () => {
    const content = ["a", "b", "c", "d", "e"].join("\n");
    const chunks = chunkSource(source({ path: "src/notes.ts", content }), {
      maxLines: 3,
      overlapLines: 1,
    });
    expect(chunks.map((chunk) => [chunk.startLine, chunk.endLine, chunk.kind])).toEqual([
      [1, 3, "block"],
      [3, 5, "block"],
    ]);
  });

  it("splits markdown on headings", () => {
    const content = ["intro", "# Install", "npm i", "# Usage", "run it"].join("\n");
    const chunks = chunkSource(
      source({ path: "README.md", content, language: "Markdown", fileKind: "docs", symbols: [] }),
    );
    expect(chunks.map((chunk) => chunk.symbol)).toEqual([undefined, "Install", "Usage"]);
    expect(chunks[1]?.kind).toBe("docs");
  });
});
