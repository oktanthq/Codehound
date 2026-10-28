import type { FileKind } from "../github/languages.js";

export type ChunkKind = "symbol" | "block" | "docs" | "preamble";

export type CodeChunk = {
  id: string;
  path: string;
  language: string | undefined;
  fileKind: FileKind | undefined;
  kind: ChunkKind;
  symbol: string | undefined;
  symbolKind: string | undefined;
  startLine: number;
  endLine: number;
  text: string;
  repositoryFullName: string | undefined;
  commitSha: string | undefined;
};

export type ChunkSource = {
  path: string;
  content: string;
  language: string | undefined;
  fileKind: FileKind | undefined;
  repositoryFullName: string | undefined;
  commitSha: string | undefined;
  symbols: readonly { name: string; kind: string; startLine: number; endLine: number }[];
};

export type ChunkingOptions = {
  maxLines?: number;
  overlapLines?: number;
};

export type EmbeddedChunk = CodeChunk & {
  vector: number[];
};

export type RetrievalHit = {
  chunk: CodeChunk;
  score: number;
  source: "semantic" | "keyword" | "hybrid";
};

export type RetrievalQuery = {
  text: string;
  repositoryFullName?: string;
  commitSha?: string;
  language?: string;
  pathPrefix?: string;
  symbol?: string;
  symbolKind?: string;
  chunkKind?: ChunkKind;
  limit?: number;
};

export type Retriever = {
  search: (query: RetrievalQuery) => Promise<RetrievalHit[]>;
};
