import type { Readable, Writable } from "node:stream";
import { JSONRPC_ERROR, isJsonRpcRequest, type JsonRpcRequest } from "./protocol.js";
import type { McpServer } from "./server.js";

export function encodeNdjson(message: unknown): string {
  return `${JSON.stringify(message)}\n`;
}

export function encodeContentLength(message: unknown): Buffer {
  const json = JSON.stringify(message);
  const header = `Content-Length: ${Buffer.byteLength(json, "utf8")}\r\n\r\n`;
  return Buffer.concat([Buffer.from(header, "utf8"), Buffer.from(json, "utf8")]);
}

export function parseJsonRpcLine(line: string): JsonRpcRequest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line) as unknown;
  } catch {
    throw Object.assign(new Error("Parse error"), { code: JSONRPC_ERROR.parse });
  }
  if (!isJsonRpcRequest(parsed)) {
    throw Object.assign(new Error("Invalid Request"), { code: JSONRPC_ERROR.invalidRequest });
  }
  return parsed;
}

export class McpFramer {
  private buffer = Buffer.alloc(0);

  push(chunk: Buffer): JsonRpcRequest[] {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const messages: JsonRpcRequest[] = [];
    while (this.buffer.length > 0) {
      const framed = this.readContentLength();
      if (framed === "need-more") {
        break;
      }
      if (framed !== undefined) {
        messages.push(framed);
        continue;
      }
      const newline = this.buffer.indexOf(0x0a);
      if (newline === -1) {
        break;
      }
      const line = this.buffer.subarray(0, newline).toString("utf8").replace(/\r$/, "");
      this.buffer = this.buffer.subarray(newline + 1);
      if (line.trim().length === 0) {
        continue;
      }
      messages.push(parseJsonRpcLine(line));
    }
    return messages;
  }

  private readContentLength(): JsonRpcRequest | undefined | "need-more" {
    const text = this.buffer.toString("utf8");
    if (!/^Content-Length:/i.test(text) && !text.startsWith("Content-")) {
      return undefined;
    }
    const headerEnd = this.buffer.indexOf("\r\n\r\n");
    if (headerEnd === -1) {
      return text.includes("\n") && !/^Content-Length:/i.test(text) ? undefined : "need-more";
    }
    const header = this.buffer.subarray(0, headerEnd).toString("utf8");
    const match = /Content-Length:\s*(\d+)/i.exec(header);
    if (match?.[1] === undefined) {
      return undefined;
    }
    const length = Number.parseInt(match[1], 10);
    const start = headerEnd + 4;
    if (this.buffer.length < start + length) {
      return "need-more";
    }
    const json = this.buffer.subarray(start, start + length).toString("utf8");
    this.buffer = this.buffer.subarray(start + length);
    return parseJsonRpcLine(json);
  }
}

export async function listenStdio(
  server: McpServer,
  input: Readable,
  output: Writable,
): Promise<void> {
  const framer = new McpFramer();
  for await (const chunk of input) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), "utf8");
    for (const message of framer.push(buffer)) {
      const response = await server.handle(message);
      if (response !== undefined) {
        output.write(encodeNdjson(response));
      }
    }
  }
}
