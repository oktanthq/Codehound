import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import {
  encodeContentLength,
  encodeNdjson,
  listenStdio,
  McpFramer,
  parseJsonRpcLine,
} from "../../src/mcp/stdio.js";
import { JSONRPC_VERSION } from "../../src/mcp/protocol.js";
import { createDemoServer } from "./harness.js";

describe("MCP stdio transport", () => {
  it("parses newline-delimited JSON-RPC", () => {
    const framer = new McpFramer();
    const messages = framer.push(
      Buffer.from(
        `${JSON.stringify({ jsonrpc: JSONRPC_VERSION, id: 1, method: "ping" })}\n`,
        "utf8",
      ),
    );
    expect(messages).toEqual([{ jsonrpc: "2.0", id: 1, method: "ping" }]);
  });

  it("parses Content-Length framed messages", () => {
    const framer = new McpFramer();
    const payload = { jsonrpc: JSONRPC_VERSION, id: 7, method: "ping" };
    const messages = framer.push(encodeContentLength(payload));
    expect(messages[0]).toMatchObject({ id: 7, method: "ping" });
  });

  it("rejects malformed JSON lines", () => {
    expect(() => parseJsonRpcLine("{")).toThrow(/Parse error/);
    expect(encodeNdjson({ ok: true })).toBe('{"ok":true}\n');
  });

  it("answers ping over a readable stream", async () => {
    const { server } = await createDemoServer();
    const input = new PassThrough();
    const output = new PassThrough();
    const chunks: Buffer[] = [];
    output.on("data", (chunk: Buffer) => {
      chunks.push(Buffer.from(chunk));
    });
    const listening = listenStdio(server, input, output);
    input.write(encodeNdjson({ jsonrpc: JSONRPC_VERSION, id: 3, method: "ping" }));
    input.end();
    await listening;
    const body = Buffer.concat(chunks).toString("utf8");
    expect(JSON.parse(body)).toMatchObject({ id: 3, result: {} });
  });
});
