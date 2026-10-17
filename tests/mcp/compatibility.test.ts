import { describe, expect, it } from "vitest";
import { JSONRPC_ERROR, MCP_PROTOCOL_VERSION } from "../../src/mcp/protocol.js";
import { createDemoServer, request } from "./harness.js";

const CLIENTS = [
  { name: "mcp-stdio-client", version: "1.0.0" },
  { name: "editor-extension", version: "2.0.0" },
  { name: "cli-coding-agent", version: "0.4.0" },
] as const;

describe("MCP coding-agent compatibility", () => {
  it.each([...CLIENTS])("handshakes with $name and exposes callable tools", async (client) => {
    const { server } = await createDemoServer();
    const init = await server.handle(
      request("initialize", {
        protocolVersion: "2025-06-18",
        capabilities: { tools: {} },
        clientInfo: client,
      }),
    );
    expect(init).toMatchObject({
      result: {
        protocolVersion: "2025-06-18",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "codehound", version: "0.1.0" },
      },
    });

    const listed = await server.handle(request("tools/list", undefined, 2));
    const tools = (
      listed as { result: { tools: { name: string; inputSchema: { type: string } }[] } }
    ).result.tools;
    expect(tools.length).toBeGreaterThan(5);
    for (const tool of tools) {
      expect(tool.inputSchema.type).toBe("object");
    }

    const call = await server.handle(
      request("tools/call", { name: "codehound_list_projects", arguments: {} }, 3),
    );
    const result = (
      call as {
        result: {
          content: { type: string; text: string }[];
          structuredContent: unknown;
        };
      }
    ).result;
    expect(result.content[0]?.type).toBe("text");
    expect(() => JSON.parse(result.content[0]?.text ?? "")).not.toThrow();
    expect(result.structuredContent).toBeTypeOf("object");

    const resources = await server.handle(request("resources/list", undefined, 4));
    expect(resources).toMatchObject({ result: { resources: [] } });
  });

  it("keeps JSON-RPC ids and reports unknown tools without crashing", async () => {
    const { server } = await createDemoServer();
    await server.handle(
      request("initialize", {
        protocolVersion: MCP_PROTOCOL_VERSION,
        clientInfo: { name: "mcp-stdio-client", version: "1" },
      }),
    );
    const missing = await server.handle(
      request("tools/call", { name: "not_a_tool", arguments: {} }, "rpc-9"),
    );
    expect(missing).toMatchObject({
      id: "rpc-9",
      error: { code: JSONRPC_ERROR.methodNotFound },
    });
  });
});
