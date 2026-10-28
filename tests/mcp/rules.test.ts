import { describe, expect, it } from "vitest";
import { DEMO_REPO, callTool, createDemoServer } from "./harness.js";

describe("MCP business-rule queries", () => {
  it("lists rules and returns governed symbols and files", async () => {
    const { server } = await createDemoServer();
    const listed = await callTool(server, "codehound_list_rules", { repository: DEMO_REPO });
    const rules = (listed.data as { rules: { name: string }[] }).rules;
    expect(rules.some((rule) => rule.name === "validateName")).toBe(true);

    const detail = await callTool(server, "codehound_get_rule", {
      repository: DEMO_REPO,
      name: "validateName",
    });
    const governed = (detail.data as { governs: { kind: string; name?: string; path?: string }[] })
      .governs;
    expect(
      governed.some((entity) => entity.kind === "symbol" && entity.name === "validateName"),
    ).toBe(true);
    expect(
      governed.some((entity) => entity.kind === "file" && entity.path === "src/index.ts"),
    ).toBe(true);
  });
});
