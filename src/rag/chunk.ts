import type { AnalysisDocument } from "../analysis/types.js";
import type { ChunkingOptions, ChunkSource, CodeChunk } from "./types.js";

const DEFAULT_MAX_LINES = 40;
const DEFAULT_OVERLAP = 5;

function linesOf(content: string): string[] {
  return content.split(/\r?\n/);
}

function sliceLines(lines: readonly string[], startLine: number, endLine: number): string {
  return lines.slice(Math.max(0, startLine - 1), Math.max(startLine - 1, endLine)).join("\n");
}

export function chunkId(chunk: Omit<CodeChunk, "id">): string {
  const symbol = chunk.symbol ?? "file";
  return `${chunk.path}:${chunk.startLine}:${chunk.endLine}:${chunk.kind}:${symbol}`;
}

function makeChunk(
  source: ChunkSource,
  fields: Pick<CodeChunk, "kind" | "symbol" | "symbolKind" | "startLine" | "endLine" | "text">,
): CodeChunk {
  const chunk: Omit<CodeChunk, "id"> = {
    path: source.path,
    language: source.language,
    fileKind: source.fileKind,
    kind: fields.kind,
    symbol: fields.symbol,
    symbolKind: fields.symbolKind,
    startLine: fields.startLine,
    endLine: fields.endLine,
    text: fields.text,
    repositoryFullName: source.repositoryFullName,
    commitSha: source.commitSha,
  };
  return { ...chunk, id: chunkId(chunk) };
}

function isMarkdown(path: string, language: string | undefined): boolean {
  return language === "Markdown" || /\.(md|mdx|rst)$/i.test(path);
}

function headingChunks(source: ChunkSource, lines: readonly string[]): CodeChunk[] {
  const starts: number[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (/^#{1,6}\s+\S/.test(lines[index] ?? "")) {
      starts.push(index + 1);
    }
  }
  if (starts.length === 0) {
    return [];
  }
  const chunks: CodeChunk[] = [];
  if (starts[0] !== undefined && starts[0] > 1) {
    chunks.push(
      makeChunk(source, {
        kind: "preamble",
        symbol: undefined,
        symbolKind: undefined,
        startLine: 1,
        endLine: starts[0] - 1,
        text: sliceLines(lines, 1, starts[0] - 1),
      }),
    );
  }
  for (let index = 0; index < starts.length; index += 1) {
    const startLine = starts[index] ?? 1;
    const endLine = (starts[index + 1] ?? lines.length + 1) - 1;
    const heading = (lines[startLine - 1] ?? "").replace(/^#{1,6}\s+/, "").trim();
    chunks.push(
      makeChunk(source, {
        kind: "docs",
        symbol: heading.length > 0 ? heading : undefined,
        symbolKind: "heading",
        startLine,
        endLine,
        text: sliceLines(lines, startLine, endLine),
      }),
    );
  }
  return chunks;
}

function windowChunks(
  source: ChunkSource,
  lines: readonly string[],
  options: ChunkingOptions,
): CodeChunk[] {
  const maxLines = options.maxLines ?? DEFAULT_MAX_LINES;
  const overlapLines = Math.min(options.overlapLines ?? DEFAULT_OVERLAP, Math.max(0, maxLines - 1));
  if (lines.length === 0) {
    return [];
  }
  const chunks: CodeChunk[] = [];
  let startLine = 1;
  while (startLine <= lines.length) {
    const endLine = Math.min(lines.length, startLine + maxLines - 1);
    chunks.push(
      makeChunk(source, {
        kind: "block",
        symbol: undefined,
        symbolKind: undefined,
        startLine,
        endLine,
        text: sliceLines(lines, startLine, endLine),
      }),
    );
    if (endLine === lines.length) {
      break;
    }
    startLine = endLine - overlapLines + 1;
  }
  return chunks;
}

function symbolChunks(source: ChunkSource, lines: readonly string[]): CodeChunk[] {
  const sorted = [...source.symbols].sort((a, b) => {
    if (a.startLine !== b.startLine) {
      return a.startLine - b.startLine;
    }
    return b.endLine - a.endLine;
  });
  const chunks: CodeChunk[] = [];
  const first = sorted[0];
  if (first !== undefined && first.startLine > 1) {
    chunks.push(
      makeChunk(source, {
        kind: "preamble",
        symbol: undefined,
        symbolKind: undefined,
        startLine: 1,
        endLine: first.startLine - 1,
        text: sliceLines(lines, 1, first.startLine - 1),
      }),
    );
  }
  for (const symbol of sorted) {
    const startLine = Math.max(1, symbol.startLine);
    const endLine = Math.min(lines.length, Math.max(startLine, symbol.endLine));
    chunks.push(
      makeChunk(source, {
        kind: "symbol",
        symbol: symbol.name,
        symbolKind: symbol.kind,
        startLine,
        endLine,
        text: sliceLines(lines, startLine, endLine),
      }),
    );
  }
  return chunks.filter((chunk) => chunk.text.trim().length > 0);
}

export function chunkSource(source: ChunkSource, options: ChunkingOptions = {}): CodeChunk[] {
  const lines = linesOf(source.content);
  if (lines.length === 1 && (lines[0] ?? "").length === 0) {
    return [];
  }
  if (isMarkdown(source.path, source.language)) {
    const docs = headingChunks(source, lines);
    if (docs.length > 0) {
      return docs;
    }
  }
  if (source.symbols.length > 0) {
    return symbolChunks(source, lines);
  }
  return windowChunks(source, lines, options);
}

export function chunkDocument(
  document: AnalysisDocument,
  content: string,
  context: { repositoryFullName: string; commitSha: string },
  options: ChunkingOptions = {},
): CodeChunk[] {
  return chunkSource(
    {
      path: document.path,
      content,
      language: document.language,
      fileKind: undefined,
      repositoryFullName: context.repositoryFullName,
      commitSha: context.commitSha,
      symbols: document.symbols,
    },
    options,
  );
}
