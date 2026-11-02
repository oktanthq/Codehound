import { describe, expect, it } from "vitest";
import type { RetrievalQuery, Retriever } from "../../src/rag/types.js";
import { reviewPull, reviewPullWithContext } from "../../src/review/engine.js";
import { addedFile, changedFile, relatedHit } from "./helpers.js";

const pull = {
  installationId: 9,
  ingestedAt: "2023-11-14T22:13:20.000Z",
  pull: {
    number: 12,
    title: "unsafe",
    body: "",
    state: "open",
    draft: false,
    htmlUrl: "https://github.com/oktant/demo/pull/12",
    fullName: "oktant/demo",
    baseRef: "main",
    baseSha: "aaa",
    headRef: "feat",
    headSha: "bbb",
    author: "dev",
    updatedAt: "2023-11-14T22:13:20Z",
  },
  files: [addedFile("src/bad.ts", ["eval(x);", "console.log(x);"])],
  commits: [],
};

describe("review engine", () => {
  it("collects classified findings, comments, and a summary", () => {
    const report = reviewPull({ pull });
    expect(report.findings.some((finding) => finding.ruleId === "security.eval")).toBe(true);
    expect(report.comments.length).toBeGreaterThan(0);
    expect(report.summary.event).toBe("REQUEST_CHANGES");
    expect(report.codeContext).toEqual([]);
  });

  it("retrieves related code context when a retriever is provided", async () => {
    const queries: RetrievalQuery[] = [];
    const retriever: Retriever = {
      async search(query) {
        queries.push(query);
        return [relatedHit("src/index.ts", 4)];
      },
    };
    const report = await reviewPullWithContext({
      retriever,
      pull: {
        ...pull,
        files: [changedFile("src/greet.ts", ["export function greet() { return 1; }"], [])],
      },
    });
    expect(queries.length).toBeGreaterThan(0);
    expect(report.codeContext[0]?.hits.some((hit) => hit.chunk.path === "src/index.ts")).toBe(true);
    expect(report.findings.some((finding) => finding.ruleId === "regression.related-code")).toBe(
      true,
    );
    expect(report.comments.some((comment) => comment.body.includes("src/index.ts:4"))).toBe(true);
    expect(report.summary.body).toContain("Related code");
    expect(report.summary.body).toContain("src/index.ts:4");
  });

  it("uses precomputed codeContext without calling the retriever", async () => {
    let called = false;
    const retriever: Retriever = {
      async search() {
        called = true;
        return [];
      },
    };
    const report = await reviewPullWithContext({
      retriever,
      codeContext: [
        {
          path: "src/greet.ts",
          status: "modified",
          addedLines: [1],
          hits: [relatedHit("src/index.ts", 4)],
        },
      ],
      pull: {
        ...pull,
        files: [changedFile("src/greet.ts", ["export function greet() { return 1; }"], [])],
      },
    });
    expect(called).toBe(false);
    expect(report.findings.some((finding) => finding.ruleId === "regression.related-code")).toBe(
      true,
    );
  });

  it("matches reviewPull when no retriever is configured", async () => {
    const syncReport = reviewPull({ pull });
    const asyncReport = await reviewPullWithContext({ pull });
    expect(asyncReport.findings).toEqual(syncReport.findings);
    expect(asyncReport.comments).toEqual(syncReport.comments);
    expect(asyncReport.summary).toEqual(syncReport.summary);
    expect(asyncReport.codeContext).toEqual([]);
  });
});
