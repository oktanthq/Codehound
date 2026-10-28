export const JSONRPC_VERSION = "2.0" as const;

export const MCP_PROTOCOL_VERSION = "2024-11-05";

export const SUPPORTED_PROTOCOL_VERSIONS = ["2024-11-05", "2025-03-26", "2025-06-18"] as const;

export type McpProtocolVersion = (typeof SUPPORTED_PROTOCOL_VERSIONS)[number];

export const JSONRPC_ERROR = {
  parse: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internal: -32603,
} as const;

export type JsonRpcId = string | number;

export type JsonRpcRequest = {
  jsonrpc: typeof JSONRPC_VERSION;
  id?: JsonRpcId;
  method: string;
  params?: unknown;
};

export type JsonRpcError = {
  code: number;
  message: string;
  data?: unknown;
};

export type JsonRpcSuccess = {
  jsonrpc: typeof JSONRPC_VERSION;
  id: JsonRpcId;
  result: unknown;
};

export type JsonRpcFailure = {
  jsonrpc: typeof JSONRPC_VERSION;
  id: JsonRpcId;
  error: JsonRpcError;
};

export type JsonRpcResponse = JsonRpcSuccess | JsonRpcFailure;

export type McpImplementation = {
  name: string;
  version: string;
};

export type McpClientInfo = McpImplementation & {
  title?: string;
};

export type McpInitializeParams = {
  protocolVersion: string;
  capabilities?: Record<string, unknown>;
  clientInfo?: McpClientInfo;
};

export type McpInitializeResult = {
  protocolVersion: string;
  capabilities: {
    tools: { listChanged: boolean };
    resources: Record<string, never>;
    prompts: Record<string, never>;
  };
  serverInfo: McpImplementation;
  instructions?: string;
};

export type McpTextContent = {
  type: "text";
  text: string;
};

export type McpToolResult = {
  content: McpTextContent[];
  isError?: boolean;
  structuredContent?: unknown;
};

export type JsonSchemaProperty = {
  type: "string" | "number" | "integer" | "boolean" | "object" | "array";
  description?: string;
  default?: string | number | boolean;
};

export type JsonSchema = {
  type: "object";
  properties: Record<string, JsonSchemaProperty>;
  required?: string[];
  additionalProperties: boolean;
};

export type McpToolDefinition = {
  name: string;
  description: string;
  inputSchema: JsonSchema;
};

export function isSupportedProtocolVersion(value: string): value is McpProtocolVersion {
  return (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(value);
}

export function negotiateProtocolVersion(requested: string): string {
  if (isSupportedProtocolVersion(requested)) {
    return requested;
  }
  return MCP_PROTOCOL_VERSION;
}

export function isJsonRpcRequest(value: unknown): value is JsonRpcRequest {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (record.jsonrpc !== JSONRPC_VERSION || typeof record.method !== "string") {
    return false;
  }
  if (record.id !== undefined && typeof record.id !== "string" && typeof record.id !== "number") {
    return false;
  }
  return true;
}

export function jsonRpcSuccess(id: JsonRpcId, result: unknown): JsonRpcSuccess {
  return { jsonrpc: JSONRPC_VERSION, id, result };
}

export function jsonRpcError(
  id: JsonRpcId,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcFailure {
  const error: JsonRpcError = { code, message };
  if (data !== undefined) {
    error.data = data;
  }
  return { jsonrpc: JSONRPC_VERSION, id, error };
}
