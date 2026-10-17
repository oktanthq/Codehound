import { describe, expect, it } from "vitest";
import { DEMO_REPO, callTool, createDemoServer } from "./harness.js";

describe("MCP RAG and CIM context composition", () => {
  it("joins retrieved chunks with graph neighbors", async () => {
    const { server } = await createDemoServer();
    const composed = await callTool(server, "codehound_compose_context", {
      query: "how does greet work",
      repository: DEMO_REPO,
      limit: 5,
    });
    const data = composed.data as {
      retrieval: { path: string }[];
      graph: { path: string; symbols: string[]; files: unknown[] }[];
    };
    expect(data.retrieval.length).toBeGreaterThan(0);
    expect(data.graph.length).toBeGreaterThan(0);
    expect(composed.citations.length).toBeGreaterThan(0);
    expect(composed.hints.length).toBeGreaterThan(0);
  });
});
