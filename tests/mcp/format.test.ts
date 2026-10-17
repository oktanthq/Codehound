import { describe, expect, it } from "vitest";
import { citationFrom, formatAgentResult, formatToolError } from "../../src/mcp/format.js";
import { DEMO_REPO, callTool, createDemoServer } from "./harness.js";

describe("agent-oriented MCP formatting", () => {
  it("wraps tool data in summary, citations, and structured content", () => {
    const result = formatAgentResult(
      "codehound_status",
      "ok",
      { ready: true },
      { citations: [citationFrom("src/a.ts", { startLine: 1, endLine: 4, symbol: "a" })] },
    );
    expect(result.content[0]?.type).toBe("text");
    expect(result.content[0]?.text).toContain('"summary": "ok"');
    expect(result.structuredContent).toMatchObject({
      tool: "codehound_status",
      summary: "ok",
      citations: [{ path: "src/a.ts", startLine: 1, symbol: "a" }],
    });
    expect(formatToolError("codehound_status", "boom").isError).toBe(true);
  });

  it("returns parseable JSON text from live tools", async () => {
    const { server } = await createDemoServer();
    const payload = await callTool(server, "codehound_list_projects", { query: DEMO_REPO });
    expect(payload.tool).toBe("codehound_list_projects");
    expect(payload.summary.toLowerCase()).toContain("project");
    expect(payload.data).toBeTypeOf("object");
  });
});
