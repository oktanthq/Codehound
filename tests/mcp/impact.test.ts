import { describe, expect, it } from "vitest";
import { DEMO_REPO, callTool, createDemoServer } from "./harness.js";

describe("MCP impact-analysis queries", () => {
  it("reports dependents, callers, layers, and rules for a change", async () => {
    const { server } = await createDemoServer();
    const impact = await callTool(server, "codehound_analyze_impact", {
      repository: DEMO_REPO,
      path: "src/greet.ts",
      symbol: "greet",
    });
    const data = impact.data as {
      dependents: { from: string }[];
      callers: { from: string }[];
      layers: string[];
    };
    expect(data.dependents.some((edge) => edge.from === "src/index.ts")).toBe(true);
    expect(data.callers.some((edge) => edge.from === "validateName")).toBe(true);
    expect(data.layers).toContain("application");
    expect(impact.citations.some((citation) => citation.path === "src/greet.ts")).toBe(true);
  });
});
