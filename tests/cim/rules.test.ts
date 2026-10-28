import { describe, expect, it } from "vitest";
import { isRuleName } from "../../src/cim/rules.js";
import { modelFrom } from "./helpers.js";

describe("CIM business-rule extraction", () => {
  it("treats validate/assert/ensure/check/guard symbols as rules", () => {
    expect(isRuleName("validateUser")).toBe(true);
    expect(isRuleName("assertReady")).toBe(true);
    expect(isRuleName("ensureBound")).toBe(true);
    expect(isRuleName("checkAccess")).toBe(true);
    expect(isRuleName("guardRoute")).toBe(true);
    expect(isRuleName("greet")).toBe(false);
  });

  it("extracts rule entities from matching function names", async () => {
    const { query } = await modelFrom([
      {
        path: "src/users.ts",
        content:
          "export function validateUser(name: string) { return name.length > 0; }\nexport function greet(name: string) { return name; }\n",
      },
    ]);
    expect(query.rules().map((entity) => entity.name)).toEqual(["validateUser"]);
    expect(query.byKind("symbol").some((entity) => entity.name === "greet")).toBe(true);
  });
});
