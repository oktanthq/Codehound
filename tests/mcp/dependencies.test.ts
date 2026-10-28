import { describe, expect, it } from "vitest";
import { DEMO_REPO, callTool, createDemoServer } from "./harness.js";

describe("MCP dependency graph queries", () => {
  it("returns outgoing and incoming file dependencies", async () => {
    const { server } = await createDemoServer();
    const deps = await callTool(server, "codehound_get_dependencies", {
      repository: DEMO_REPO,
      path: "src/index.ts",
    });
    const outgoing = deps.data as { files: { from: string; to: string }[] };
    expect(outgoing.files).toContainEqual(
      expect.objectContaining({ from: "src/index.ts", to: "src/greet.ts" }),
    );

    const dependents = await callTool(server, "codehound_get_dependents", {
      repository: DEMO_REPO,
      path: "src/greet.ts",
    });
    const incoming = dependents.data as { files: { from: string; to: string }[] };
    expect(incoming.files.some((edge) => edge.from === "src/index.ts")).toBe(true);
    expect(incoming.files.some((edge) => edge.from === "tests/greet.test.ts")).toBe(true);
  });
});
