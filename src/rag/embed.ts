import type { CodeChunk, EmbeddedChunk } from "./types.js";
import { hashToken, tokenize } from "./tokenize.js";

export type Embedder = {
  readonly id: string;
  readonly dimensions: number;
  embed: (texts: readonly string[]) => Promise<number[][]>;
};

export function l2Normalize(vector: number[]): number[] {
  let sum = 0;
  for (const value of vector) {
    sum += value * value;
  }
  const magnitude = Math.sqrt(sum);
  if (magnitude === 0) {
    return vector;
  }
  return vector.map((value) => value / magnitude);
}

export function cosineSimilarity(left: readonly number[], right: readonly number[]): number {
  const length = Math.min(left.length, right.length);
  let sum = 0;
  for (let index = 0; index < length; index += 1) {
    sum += (left[index] ?? 0) * (right[index] ?? 0);
  }
  return sum;
}

export class HashingEmbedder implements Embedder {
  readonly id = "hashing";

  constructor(readonly dimensions = 64) {}

  async embed(texts: readonly string[]): Promise<number[][]> {
    return texts.map((text) => this.embedText(text));
  }

  embedText(text: string): number[] {
    const vector = new Array<number>(this.dimensions).fill(0);
    for (const token of tokenize(text)) {
      const hashed = hashToken(token);
      const index = hashed % this.dimensions;
      const sign = hashed % 2 === 0 ? 1 : -1;
      vector[index] = (vector[index] ?? 0) + sign;
    }
    return l2Normalize(vector);
  }
}

export class EmbeddingPipeline {
  constructor(private readonly embedder: Embedder) {}

  async embedChunks(chunks: readonly CodeChunk[]): Promise<EmbeddedChunk[]> {
    if (chunks.length === 0) {
      return [];
    }
    const vectors = await this.embedder.embed(chunks.map((chunk) => chunk.text));
    return chunks.map((chunk, index) => ({
      ...chunk,
      vector: vectors[index] ?? [],
    }));
  }

  async embedQuery(text: string): Promise<number[]> {
    const [vector] = await this.embedder.embed([text]);
    return vector ?? [];
  }
}
