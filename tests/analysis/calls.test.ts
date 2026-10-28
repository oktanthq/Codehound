import { describe, expect, it } from "vitest";
import { extractCalls } from "../../src/analysis/calls.js";
import { parseTypeScript } from "../../src/analysis/parse.js";

describe("extractCalls", () => {
  it("records calls and constructions with their enclosing symbol", () => {
    const source = `
function helper(): number {
  return Math.abs(-1);
}
export function greet(name: string): string {
  helper();
  console.log(name);
  return name;
}
export const run = (): Box => {
  const box = new Box();
  box.size();
  return box;
};
export class Box {
  constructor() {
    helper();
  }
  size(): number {
    return this.value();
  }
  value(): number {
    return 1;
  }
}
helper();
`;
    const parsed = parseTypeScript("src/graph.ts", source, "TypeScript");
    expect(extractCalls(parsed.sourceFile)).toEqual([
      { from: "helper", to: "Math.abs", startLine: 3 },
      { from: "greet", to: "helper", startLine: 6 },
      { from: "greet", to: "console.log", startLine: 7 },
      { from: "run", to: "Box", startLine: 11 },
      { from: "run", to: "box.size", startLine: 12 },
      { from: "Box.constructor", to: "helper", startLine: 17 },
      { from: "Box.size", to: "this.value", startLine: 20 },
      { from: "<module>", to: "helper", startLine: 26 },
    ]);
  });

  it("skips require and dynamic import calls", () => {
    const source = `
const ts = require("typescript");
const loaded = import("./load.js");
read();
`;
    const parsed = parseTypeScript("src/mod.ts", source, "TypeScript");
    expect(extractCalls(parsed.sourceFile)).toEqual([
      { from: "<module>", to: "read", startLine: 4 },
    ]);
  });
});
