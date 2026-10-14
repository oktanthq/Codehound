import { describe, expect, it } from "vitest";
import {
  MCP_PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
  isJsonRpcRequest,
  isSupportedProtocolVersion,
  negotiateProtocolVersion,
} from "../../src/mcp/protocol.js";

describe("MCP protocol", () => {
  it("negotiates known versions and falls back otherwise", () => {
    expect(MCP_PROTOCOL_VERSION).toBe("2024-11-05");
    expect(isSupportedProtocolVersion("2025-06-18")).toBe(true);
    expect(SUPPORTED_PROTOCOL_VERSIONS).toContain("2025-03-26");
    expect(negotiateProtocolVersion("2025-06-18")).toBe("2025-06-18");
    expect(negotiateProtocolVersion("1999-01-01")).toBe(MCP_PROTOCOL_VERSION);
  });

  it("accepts JSON-RPC 2.0 requests and rejects malformed envelopes", () => {
    expect(isJsonRpcRequest({ jsonrpc: "2.0", method: "ping", id: 1 })).toBe(true);
    expect(isJsonRpcRequest({ jsonrpc: "2.0", method: "notifications/initialized" })).toBe(true);
    expect(isJsonRpcRequest({ jsonrpc: "1.0", method: "ping", id: 1 })).toBe(false);
    expect(isJsonRpcRequest({ method: "ping" })).toBe(false);
  });
});
