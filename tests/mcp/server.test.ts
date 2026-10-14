import { describe, expect, it } from "vitest";
import { JSONRPC_ERROR, MCP_PROTOCOL_VERSION } from "../../src/mcp/protocol.js";
import { TOOL_NAMES } from "../../src/mcp/tools.js";
import { createDemoServer, request } from "./harness.js";

describe("McpServer", () => {
  it("completes initialize, ping, and tools/list", async () => {
    const { server } = await createDemoServer();
    const initialized = await server.handle(
      request("initialize", {
        protocolVersion: MCP_PROTOCOL_VERSION,
        clientInfo: { name: "test-client", version: "1.0.0" },
      }),
    );
    expect(initialized).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        serverInfo: { name: "codehound" },
        capabilities: { tools: { listChanged: false } },
      },
    });
    expect(server.isInitialized).toBe(true);
    const ping = await server.handle(request("ping", undefined, 2));
    expect(ping).toMatchObject({ id: 2, result: {} });
    const listed = await server.handle(request("tools/list", undefined, 3));
    const tools = (listed as { result: { tools: { name: string }[] } }).result.tools;
    expect(tools.map((tool) => tool.name)).toEqual(TOOL_NAMES);
    const notify = await server.handle({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });
    expect(notify).toBeUndefined();
  });

  it("returns JSON-RPC errors for unknown methods", async () => {
    const { server } = await createDemoServer();
    const response = await server.handle(request("nope/method"));
    expect(response).toMatchObject({
      error: { code: JSONRPC_ERROR.methodNotFound },
    });
  });

  it("serves codehound_status for loaded projects", async () => {
    const { server } = await createDemoServer();
    const response = await server.handle(
      request("tools/call", { name: "codehound_status", arguments: {} }),
    );
    const result = (
      response as { result: { structuredContent: { data: { projectCount: number } } } }
    ).result;
    expect(result.structuredContent.data.projectCount).toBe(1);
  });
});
