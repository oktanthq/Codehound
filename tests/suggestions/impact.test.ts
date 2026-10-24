import { describe, expect, it } from "vitest";
import { suggestionImpactPaths } from "../../src/suggestions/impact.js";
import { createDemoServer } from "../mcp/harness.js";

describe("suggested-change impact analysis", () => {
  it("includes dependent files from the CIM", async () => {
    const { host } = await createDemoServer();
    const paths = suggestionImpactPaths(
      [
        {
          path: "src/greet.ts",
          oldText: "export function greet() { return 1; }\n",
          newText: "export function greet() { return 2; }\n",
          description: "tweak",
        },
      ],
      host.query("oktant/demo"),
    );
    expect(paths).toEqual(expect.arrayContaining(["src/greet.ts", "src/index.ts"]));
  });
});
