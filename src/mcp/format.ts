import type { McpToolResult } from "./protocol.js";

export type AgentCitation = {
  path: string;
  startLine?: number;
  endLine?: number;
  symbol?: string;
};

export type AgentPayload = {
  tool: string;
  summary: string;
  data: unknown;
  citations: AgentCitation[];
  hints: string[];
};

export function citationFrom(
  path: string,
  options: { startLine?: number; endLine?: number; symbol?: string } = {},
): AgentCitation {
  const citation: AgentCitation = { path };
  if (options.startLine !== undefined) {
    citation.startLine = options.startLine;
  }
  if (options.endLine !== undefined) {
    citation.endLine = options.endLine;
  }
  if (options.symbol !== undefined) {
    citation.symbol = options.symbol;
  }
  return citation;
}

export function formatAgentResult(
  tool: string,
  summary: string,
  data: unknown,
  options: { citations?: AgentCitation[]; hints?: string[]; isError?: boolean } = {},
): McpToolResult {
  const payload: AgentPayload = {
    tool,
    summary,
    data,
    citations: options.citations ?? [],
    hints: options.hints ?? [],
  };
  const result: McpToolResult = {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
  };
  if (options.isError === true) {
    result.isError = true;
  }
  return result;
}

export function formatToolError(tool: string, message: string): McpToolResult {
  return formatAgentResult(tool, message, { error: message }, { isError: true });
}
