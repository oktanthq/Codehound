import { describe, expect, it } from "vitest";
import { extractDataFlows } from "../../src/analysis/dataflow.js";
import { parseTypeScript } from "../../src/analysis/parse.js";

describe("extractDataFlows", () => {
  it("records assignments, returns, and call arguments", () => {
    const source = `
function greet(name: string): string {
  const copy = name;
  label = copy;
  console.log(copy);
  return copy;
}
`;
    const parsed = parseTypeScript("src/flow.ts", source, "TypeScript");
    expect(extractDataFlows(parsed.sourceFile)).toEqual([
      { from: "name", to: "copy", kind: "assign", startLine: 3 },
      { from: "copy", to: "label", kind: "assign", startLine: 4 },
      { from: "copy", to: "console.log", kind: "argument", startLine: 5 },
      { from: "copy", to: "<return>", kind: "return", startLine: 6 },
    ]);
  });
});
