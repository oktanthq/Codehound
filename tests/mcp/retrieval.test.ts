import { describe, expect, it } from "vitest";
import { DEMO_REPO, callTool, createDemoServer } from "./harness.js";

describe("MCP code retrieval tools", () => {
  it("searches code and returns file context with symbols", async () => {
    const { server } = await createDemoServer();
    const search = await callTool(server, "codehound_search_code", {
      query: "greet name",
      repository: DEMO_REPO,
      limit: 4,
    });
    const hits = (search.data as { hits: { path: string; text: string }[] }).hits;
    expect(hits.some((hit) => hit.path.includes("greet"))).toBe(true);
    expect(search.citations.length).toBeGreaterThan(0);

    const context = await callTool(server, "codehound_get_file_context", {
      repository: DEMO_REPO,
      path: "src/greet.ts",
    });
    const file = context.data as { content: string; symbols: { name: string }[] };
    expect(file.content).toContain("export function greet");
    expect(file.symbols.some((symbol) => symbol.name === "greet")).toBe(true);
  });
});
