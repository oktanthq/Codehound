import { describe, expect, it } from "vitest";
import { dataFlowGraphEdges } from "../../src/cim/graphs.js";
import { modelFrom } from "./helpers.js";

describe("CIM workflow and data-flow model", () => {
  it("records flows-to edges with flow kind", async () => {
    const { model, query } = await modelFrom([
      {
        path: "src/copy.ts",
        content:
          "export function copyName(name: string) {\n  const copy = name;\n  return copy;\n}\n",
      },
    ]);
    expect(
      dataFlowGraphEdges(model).some((edge) => edge.from === "name" && edge.to === "copy"),
    ).toBe(true);
    expect(query.dataFlowGraph().kind).toBe("flows-to");
    expect(query.dataFlowGraph().edges.some((edge) => edge.attributes?.flowKind === "assign")).toBe(
      true,
    );
    expect(query.dataFlows().length).toBeGreaterThan(0);
  });
});
