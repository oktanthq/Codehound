import { describe, expect, it } from "vitest";
import { fileDependencyGraph } from "../../src/cim/graphs.js";
import { modelFrom } from "./helpers.js";

describe("CIM dependency graph", () => {
  it("records file-to-file depends-on edges from imports", async () => {
    const { model, query } = await modelFrom([
      {
        path: "src/index.ts",
        content: 'import { greet } from "./greet.js";\nexport const n = greet("x");\n',
      },
      {
        path: "src/greet.ts",
        content: "export function greet(name: string) { return name; }\n",
      },
    ]);
    expect(fileDependencyGraph(model)).toContainEqual({
      from: "src/index.ts",
      to: "src/greet.ts",
      fromKind: "file",
      toKind: "file",
    });
    expect(query.fileDependencies()).toHaveLength(1);
    expect(query.dependencyGraph().kind).toBe("depends-on");
  });
});
