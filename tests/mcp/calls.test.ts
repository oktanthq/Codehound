import { describe, expect, it } from "vitest";
import { DEMO_REPO, callTool, createDemoServer } from "./harness.js";

describe("MCP call graph queries", () => {
  it("returns callers and callees for a symbol", async () => {
    const { server } = await createDemoServer();
    const callees = await callTool(server, "codehound_get_callees", {
      repository: DEMO_REPO,
      symbol: "validateName",
    });
    const called = (callees.data as { callees: { from: string; to: string }[] }).callees;
    expect(called).toContainEqual(expect.objectContaining({ from: "validateName", to: "greet" }));

    const callers = await callTool(server, "codehound_get_callers", {
      repository: DEMO_REPO,
      symbol: "greet",
    });
    const inbound = (callers.data as { callers: { from: string; to: string }[] }).callers;
    expect(inbound.some((edge) => edge.from === "validateName")).toBe(true);
  });
});
