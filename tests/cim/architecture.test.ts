import { describe, expect, it } from "vitest";
import { architectureGraph } from "../../src/cim/graphs.js";
import { layerForPath } from "../../src/cim/from-analysis.js";
import { modelFrom } from "./helpers.js";

describe("CIM architecture model", () => {
  it("places files in layers and records layer dependencies", async () => {
    expect(layerForPath("src/app.ts")).toBe("application");
    expect(layerForPath("tests/app.test.ts")).toBe("test");
    const { model, query } = await modelFrom([
      {
        path: "src/app.ts",
        content: "export function app() { return 1; }\n",
      },
      {
        path: "tests/app.test.ts",
        content: 'import { app } from "../src/app.js";\nexport const n = app();\n',
      },
    ]);
    expect(
      query
        .architectureLayers()
        .map((entity) => entity.name)
        .sort(),
    ).toEqual(["application", "test"]);
    expect(architectureGraph(model)).toContainEqual({
      from: "test",
      to: "application",
      fromKind: "layer",
      toKind: "layer",
    });
    expect(query.layerDependencies()).toHaveLength(1);
  });
});
