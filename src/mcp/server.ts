import { createToolHandlers, type ToolHandler } from "./handlers.js";
import type { IntelligenceHost } from "./host.js";
import {
  JSONRPC_ERROR,
  jsonRpcError,
  jsonRpcSuccess,
  negotiateProtocolVersion,
  type JsonRpcId,
  type JsonRpcRequest,
  type JsonRpcResponse,
  type McpInitializeParams,
  type McpInitializeResult,
  type McpToolDefinition,
  type McpToolResult,
} from "./protocol.js";
import { TOOL_CATALOG, getToolDefinition } from "./tools.js";

export type McpServerOptions = {
  host: IntelligenceHost;
  name?: string;
  version?: string;
  instructions?: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

export class McpServer {
  private readonly host: IntelligenceHost;
  private readonly serverName: string;
  private readonly serverVersion: string;
  private readonly instructions: string | undefined;
  private readonly handlers: Map<string, ToolHandler>;
  private initialized = false;
  private negotiatedVersion: string | undefined;

  constructor(options: McpServerOptions) {
    this.host = options.host;
    this.serverName = options.name ?? "codehound";
    this.serverVersion = options.version ?? "0.1.0";
    this.instructions = options.instructions;
    this.handlers = createToolHandlers(this.host);
  }

  get protocolVersion(): string | undefined {
    return this.negotiatedVersion;
  }

  get isInitialized(): boolean {
    return this.initialized;
  }

  listTools(): McpToolDefinition[] {
    return TOOL_CATALOG.filter((tool) => this.handlers.has(tool.name));
  }

  async handle(message: JsonRpcRequest): Promise<JsonRpcResponse | undefined> {
    if (message.id === undefined) {
      if (message.method === "notifications/initialized") {
        this.initialized = true;
      }
      return undefined;
    }
    try {
      const result = await this.dispatch(message.method, message.params, message.id);
      return jsonRpcSuccess(message.id, result);
    } catch (error) {
      const raised = error as { code?: number; message?: string };
      if (typeof raised.code === "number" && typeof raised.message === "string") {
        return jsonRpcError(message.id, raised.code, raised.message);
      }
      const messageText = error instanceof Error ? error.message : "Internal error";
      return jsonRpcError(message.id, JSONRPC_ERROR.internal, messageText);
    }
  }

  private async dispatch(method: string, params: unknown, id: JsonRpcId): Promise<unknown> {
    switch (method) {
      case "initialize":
        return this.initialize(params);
      case "ping":
        return {};
      case "tools/list":
        return { tools: this.listTools() };
      case "tools/call":
        return this.callTool(params);
      case "resources/list":
        return { resources: [] };
      case "resources/templates/list":
        return { resourceTemplates: [] };
      case "prompts/list":
        return { prompts: [] };
      case "logging/setLevel":
        return {};
      default:
        throw jsonRpcError(id, JSONRPC_ERROR.methodNotFound, `Method not found: ${method}`).error;
    }
  }

  private initialize(params: unknown): McpInitializeResult {
    const record = asRecord(params) as McpInitializeParams;
    const requested =
      typeof record.protocolVersion === "string" && record.protocolVersion.length > 0
        ? record.protocolVersion
        : "2024-11-05";
    this.negotiatedVersion = negotiateProtocolVersion(requested);
    this.initialized = true;
    const result: McpInitializeResult = {
      protocolVersion: this.negotiatedVersion,
      capabilities: {
        tools: { listChanged: false },
        resources: {},
        prompts: {},
      },
      serverInfo: { name: this.serverName, version: this.serverVersion },
    };
    if (this.instructions !== undefined) {
      result.instructions = this.instructions;
    }
    return result;
  }

  private async callTool(params: unknown): Promise<McpToolResult> {
    const record = asRecord(params);
    const name = record.name;
    if (typeof name !== "string" || name.length === 0) {
      throw Object.assign(new Error("tools/call requires name"), {
        code: JSONRPC_ERROR.invalidParams,
      });
    }
    const definition = getToolDefinition(name);
    const handler = this.handlers.get(name);
    if (definition === undefined || handler === undefined) {
      throw Object.assign(new Error(`Unknown tool: ${name}`), {
        code: JSONRPC_ERROR.methodNotFound,
      });
    }
    try {
      return await handler(record.arguments);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Tool failed";
      return {
        content: [
          { type: "text", text: JSON.stringify({ tool: name, summary: message, error: message }) },
        ],
        isError: true,
        structuredContent: { tool: name, summary: message, error: message },
      };
    }
  }
}
