import { describe, expect, it } from "vitest";
import { modelFrom } from "./helpers.js";

describe("CIM code-to-business-rule relationships", () => {
  it("binds extracted rules to the symbols and files they govern", async () => {
    const { query } = await modelFrom([
      {
        path: "src/users.ts",
        content: "export function validateUser(name: string) { return name.length > 0; }\n",
      },
    ]);
    const rule = query.rules().find((entity) => entity.name === "validateUser");
    expect(rule).toBeDefined();
    const governed = query
      .ruleBindings()
      .edges.filter((edge) => edge.fromId === rule?.id)
      .map((edge) => query.entities().find((entity) => entity.id === edge.toId));
    expect(
      governed.some((entity) => entity?.kind === "symbol" && entity.name === "validateUser"),
    ).toBe(true);
    expect(
      governed.some((entity) => entity?.kind === "file" && entity.path === "src/users.ts"),
    ).toBe(true);
  });
});
