import { describe, expect, it } from "vitest";
import { TOOL_CATALOG, TOOL_NAMES, getToolDefinition } from "../../src/mcp/tools.js";

describe("MCP tool catalog", () => {
  it("lists project intelligence tools with object schemas", () => {
    expect(TOOL_NAMES).toContain("codehound_list_projects");
    expect(TOOL_NAMES).toContain("codehound_search_code");
    expect(TOOL_NAMES).toContain("codehound_get_dependencies");
    expect(TOOL_NAMES).toContain("codehound_get_callees");
    expect(TOOL_NAMES).toContain("codehound_compose_context");
    for (const tool of TOOL_CATALOG) {
      expect(tool.name.startsWith("codehound_")).toBe(true);
      expect(tool.description.length).toBeGreaterThan(10);
      expect(tool.inputSchema.type).toBe("object");
      expect(tool.inputSchema.additionalProperties).toBe(false);
      expect(tool.inputSchema.properties).toBeTypeOf("object");
    }
    expect(getToolDefinition("codehound_get_project")?.inputSchema.required).toEqual([
      "repository",
    ]);
    expect(getToolDefinition("missing")).toBeUndefined();
  });
});
