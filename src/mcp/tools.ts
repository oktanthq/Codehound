import type { McpToolDefinition } from "./protocol.js";

function objectSchema(
  properties: McpToolDefinition["inputSchema"]["properties"],
  required: string[] = [],
): McpToolDefinition["inputSchema"] {
  const schema: McpToolDefinition["inputSchema"] = {
    type: "object",
    properties,
    additionalProperties: false,
  };
  if (required.length > 0) {
    schema.required = required;
  }
  return schema;
}

const repository = {
  type: "string" as const,
  description: "Repository full name (owner/name)",
};

export const TOOL_CATALOG: readonly McpToolDefinition[] = [
  {
    name: "codehound_status",
    description: "Report Codehound MCP server identity, protocol, and loaded projects.",
    inputSchema: objectSchema({}),
  },
  {
    name: "codehound_list_projects",
    description: "List indexed projects and repositories available to the intelligence server.",
    inputSchema: objectSchema({
      query: { type: "string", description: "Optional name substring filter" },
    }),
  },
  {
    name: "codehound_get_project",
    description: "Get a project summary, file count, layers, and commit metadata.",
    inputSchema: objectSchema({ repository }, ["repository"]),
  },
  {
    name: "codehound_list_files",
    description: "List indexed source files in a repository, optionally filtered by path prefix.",
    inputSchema: objectSchema(
      {
        repository,
        pathPrefix: {
          type: "string",
          description: "Keep files whose path starts with this prefix",
        },
      },
      ["repository"],
    ),
  },
  {
    name: "codehound_search_code",
    description: "Retrieve relevant code chunks with hybrid semantic and keyword search.",
    inputSchema: objectSchema(
      {
        query: { type: "string", description: "Natural-language or code query" },
        repository,
        pathPrefix: { type: "string", description: "Restrict hits to this path prefix" },
        limit: { type: "integer", description: "Maximum hits to return", default: 8 },
      },
      ["query"],
    ),
  },
  {
    name: "codehound_get_file_context",
    description: "Return file text plus CIM symbols, imports, and nearby retrieved chunks.",
    inputSchema: objectSchema(
      {
        repository,
        path: { type: "string", description: "Repository-relative file path" },
      },
      ["repository", "path"],
    ),
  },
  {
    name: "codehound_get_dependencies",
    description: "Return files and components that a path depends on.",
    inputSchema: objectSchema(
      {
        repository,
        path: { type: "string", description: "File path whose outgoing dependencies to list" },
      },
      ["repository", "path"],
    ),
  },
  {
    name: "codehound_get_dependents",
    description: "Return files and components that depend on a path.",
    inputSchema: objectSchema(
      {
        repository,
        path: { type: "string", description: "File path whose incoming dependents to list" },
      },
      ["repository", "path"],
    ),
  },
  {
    name: "codehound_get_callers",
    description: "Return symbols that call the named symbol.",
    inputSchema: objectSchema(
      {
        repository,
        symbol: { type: "string", description: "Callee symbol name" },
      },
      ["repository", "symbol"],
    ),
  },
  {
    name: "codehound_get_callees",
    description: "Return symbols called by the named symbol.",
    inputSchema: objectSchema(
      {
        repository,
        symbol: { type: "string", description: "Caller symbol name" },
      },
      ["repository", "symbol"],
    ),
  },
  {
    name: "codehound_list_components",
    description: "List detected components, modules, controllers, and services.",
    inputSchema: objectSchema({ repository }, ["repository"]),
  },
  {
    name: "codehound_list_layers",
    description: "List architecture layers and the files they contain.",
    inputSchema: objectSchema({ repository }, ["repository"]),
  },
  {
    name: "codehound_get_architecture",
    description: "Return layer membership and layer-to-layer dependency edges.",
    inputSchema: objectSchema({ repository }, ["repository"]),
  },
  {
    name: "codehound_list_rules",
    description: "List extracted business rules in a repository.",
    inputSchema: objectSchema({ repository }, ["repository"]),
  },
  {
    name: "codehound_get_rule",
    description: "Return a business rule and the symbols and files it governs.",
    inputSchema: objectSchema(
      {
        repository,
        name: { type: "string", description: "Rule symbol name" },
      },
      ["repository", "name"],
    ),
  },
  {
    name: "codehound_analyze_impact",
    description: "Compute dependents, callers, layers, and rules affected by a file or symbol.",
    inputSchema: objectSchema(
      {
        repository,
        path: { type: "string", description: "Changed file path" },
        symbol: { type: "string", description: "Changed symbol name" },
      },
      ["repository"],
    ),
  },
  {
    name: "codehound_compose_context",
    description: "Compose RAG hits with CIM neighbors into a single agent context bundle.",
    inputSchema: objectSchema(
      {
        query: { type: "string", description: "Question or task to gather context for" },
        repository,
        limit: { type: "integer", description: "Maximum retrieved chunks", default: 6 },
      },
      ["query"],
    ),
  },
];

export const TOOL_NAMES = TOOL_CATALOG.map((tool) => tool.name);

export function getToolDefinition(name: string): McpToolDefinition | undefined {
  return TOOL_CATALOG.find((tool) => tool.name === name);
}
