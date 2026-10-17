import { describe, expect, it } from "vitest";
import { analyzePullDiff } from "../../src/review/diff.js";
import { analyzePullImpact } from "../../src/review/impact.js";
import { createDemoServer } from "../mcp/harness.js";

describe("CIM-based pull impact analysis", () => {
  it("finds dependents and layers for changed files", async () => {
    const { host } = await createDemoServer();
    const query = host.query("oktant/demo");
    const diffs = analyzePullDiff([
      {
        path: "src/greet.ts",
        status: "modified",
        previousPath: undefined,
        additions: 1,
        deletions: 1,
        patch: undefined,
      },
    ]);
    const impact = analyzePullImpact(query, diffs);
    expect(impact[0]?.dependents.some((edge) => edge.from === "src/index.ts")).toBe(true);
    expect(impact[0]?.layers).toContain("application");
  });
});
