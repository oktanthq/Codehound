import { describe, expect, it } from "vitest";
import { callGraphEdges } from "../../src/cim/graphs.js";
import { modelFrom } from "./helpers.js";

describe("CIM call graph", () => {
  it("records caller-to-callee edges", async () => {
    const { model, query } = await modelFrom([
      {
        path: "src/names.ts",
        content:
          "export function validateName(name: string) { return helper(name); }\nfunction helper(name: string) { return name; }\n",
      },
    ]);
    expect(callGraphEdges(model)).toContainEqual({
      from: "validateName",
      to: "helper",
      fromKind: "symbol",
      toKind: "symbol",
    });
    expect(query.calls().some((edge) => edge.from === "validateName")).toBe(true);
    expect(query.callGraph().kind).toBe("calls");
  });
});
