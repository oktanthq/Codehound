import { describe, expect, it } from "vitest";
import { reviewPull } from "../../src/review/engine.js";
import { addedFile } from "./helpers.js";

describe("review engine", () => {
  it("collects classified findings, comments, and a summary", () => {
    const report = reviewPull({
      pull: {
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
      },
    });
    expect(report.findings.some((finding) => finding.ruleId === "security.eval")).toBe(true);
    expect(report.comments.length).toBeGreaterThan(0);
    expect(report.summary.event).toBe("REQUEST_CHANGES");
  });
});
