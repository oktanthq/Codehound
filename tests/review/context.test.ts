import { describe, expect, it } from "vitest";
import { analyzePullDiff } from "../../src/review/diff.js";
import { retrieveChangedCodeContext } from "../../src/review/context.js";
import { createDemoServer } from "../mcp/harness.js";

describe("changed-code context retrieval", () => {
  it("retrieves indexed chunks for changed files", async () => {
    const { host } = await createDemoServer();
    const diffs = analyzePullDiff([
      {
        path: "src/greet.ts",
        status: "modified",
        previousPath: undefined,
        additions: 1,
        deletions: 0,
        patch:
          "@@ -1,1 +1,1 @@\n-export function greet(name: string) { return name; }\n+export function greet(name: string) { return `hi ${name}`; }",
      },
    ]);
    const retriever = host.retriever;
    if (retriever === undefined) {
      throw new Error("expected retriever");
    }
    const contexts = await retrieveChangedCodeContext(retriever, diffs, "oktant/demo");
    expect(contexts[0]?.path).toBe("src/greet.ts");
    expect(contexts[0]?.hits.some((hit) => hit.chunk.path === "src/greet.ts")).toBe(true);
  });
});
