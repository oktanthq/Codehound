import { describe, expect, it } from "vitest";
import { makeFinding } from "../../src/review/findings.js";
import { mapIssueToCode } from "../../src/suggestions/issue-map.js";
import { createDemoServer } from "../mcp/harness.js";

describe("issue-to-code context mapping", () => {
  it("maps findings and CIM symbols onto file locations", async () => {
    const { host } = await createDemoServer();
    const fromFinding = await mapIssueToCode(
      { text: "console" },
      {
        findings: [
          makeFinding({
            category: "practice",
            ruleId: "practice.console",
            severity: "low",
            title: "Console usage",
            message: "Avoid console.log.",
            path: "src/a.ts",
            startLine: 3,
          }),
        ],
      },
    );
    expect(fromFinding[0]).toMatchObject({ path: "src/a.ts", startLine: 3 });

    const mapped: {
      query: ReturnType<typeof host.query>;
      retriever?: NonNullable<typeof host.retriever>;
    } = {
      query: host.query("oktant/demo"),
    };
    if (host.retriever !== undefined) {
      mapped.retriever = host.retriever;
    }
    const fromCim = await mapIssueToCode({ text: "greet" }, mapped);
    expect(
      fromCim.some((location) => location.symbol === "greet" || location.path.includes("greet")),
    ).toBe(true);
  });
});
