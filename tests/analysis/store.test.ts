import { describe, expect, it } from "vitest";
import { createDefaultAnalysisPipeline } from "../../src/analysis/defaults.js";
import { InMemoryAnalysisStore } from "../../src/analysis/store.js";

const context = {
  repositoryFullName: "oktant/demo",
  commitSha: "abc",
  ref: "main",
};

describe("InMemoryAnalysisStore", () => {
  it("stores and retrieves an analysis run by repository and commit", async () => {
    const run = await createDefaultAnalysisPipeline().analyze(context, [
      {
        path: "src/index.ts",
        language: "TypeScript",
        kind: "source",
        content: "export const n = 1;\n",
      },
    ]);
    const store = new InMemoryAnalysisStore();
    const saved = await store.save(run, "2023-11-14T22:13:20.000Z");

    expect(saved.documentCount).toBe(1);
    expect(saved.skippedCount).toBe(0);
    expect((await store.get("OKTANT/demo", "abc"))?.run.documents[0]?.path).toBe("src/index.ts");
    expect((await store.getLatest("oktant/demo"))?.commitSha).toBe("abc");
  });

  it("lists versions newest first", async () => {
    const store = new InMemoryAnalysisStore();
    const older = await createDefaultAnalysisPipeline().analyze({ ...context, commitSha: "aaa" }, [
      { path: "a.ts", language: "TypeScript", kind: "source", content: "export const a = 1;\n" },
    ]);
    const newer = await createDefaultAnalysisPipeline().analyze({ ...context, commitSha: "bbb" }, [
      { path: "b.ts", language: "TypeScript", kind: "source", content: "export const b = 2;\n" },
    ]);
    await store.save(older, "2023-11-14T22:13:20.000Z");
    await store.save(newer, "2023-11-14T22:13:30.000Z");
    expect((await store.list("oktant/demo")).map((item) => item.commitSha)).toEqual(["bbb", "aaa"]);
  });
});
