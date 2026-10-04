import { describe, expect, it } from "vitest";
import { parseTypeScript } from "../../src/analysis/parse.js";
import { extractSymbols } from "../../src/analysis/symbols.js";

describe("extractSymbols", () => {
  it("extracts functions, types, classes, and members", () => {
    const source = `
export function greet(name: string): string {
  return name;
}
export const answer = 42;
export const run = (): void => undefined;
export class Box {
  constructor(readonly value: number) {}
  size(): number {
    return this.value;
  }
}
export interface Named {
  name: string;
}
export type Id = string;
export enum Color {
  Red,
  Blue,
}
export namespace Util {
  export const z = 1;
}
`;
    const parsed = parseTypeScript("src/model.ts", source, "TypeScript");
    expect(extractSymbols(parsed.sourceFile)).toEqual([
      { name: "greet", kind: "function", startLine: 2, endLine: 4 },
      { name: "answer", kind: "variable", startLine: 5, endLine: 5 },
      { name: "run", kind: "function", startLine: 6, endLine: 6 },
      { name: "Box", kind: "class", startLine: 7, endLine: 12 },
      { name: "constructor", kind: "constructor", startLine: 8, endLine: 8 },
      { name: "size", kind: "method", startLine: 9, endLine: 11 },
      { name: "Named", kind: "interface", startLine: 13, endLine: 15 },
      { name: "Id", kind: "type", startLine: 16, endLine: 16 },
      { name: "Color", kind: "enum", startLine: 17, endLine: 20 },
      { name: "Util", kind: "namespace", startLine: 21, endLine: 23 },
      { name: "z", kind: "variable", startLine: 22, endLine: 22 },
    ]);
  });
});
