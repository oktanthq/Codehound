import { describe, expect, it } from "vitest";
import { dependencyGuard } from "../../src/suggestions/guards.js";
import { createDemoServer } from "../mcp/harness.js";

describe("dependency-aware modifications", () => {
  it("blocks dropping exports that other files depend on", async () => {
    const { host } = await createDemoServer();
    const problem = dependencyGuard(
      {
        path: "src/greet.ts",
        oldText: "export function greet(name: string) { return name; }\n",
        newText: "export function other() { return 1; }\n",
        description: "drop greet",
      },
      host.query("oktant/demo"),
    );
    expect(problem).toMatch(/greet/);
  });
});
