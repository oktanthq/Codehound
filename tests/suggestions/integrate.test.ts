import { describe, expect, it } from "vitest";
import { reviewPull } from "../../src/review/engine.js";
import { attachSuggestionsToReport } from "../../src/suggestions/integrate.js";
import { generateSuggestions } from "../../src/suggestions/pipeline.js";
import { addedFile } from "../review/helpers.js";

describe("suggestion integration with PR review", () => {
  it("appends a diff fence to matching review comments", () => {
    const files = new Map([
      ["src/a.ts", "export function run() {\n  console.log(1);\n  return 1;\n}\n"],
    ]);
    const report = reviewPull({
      files,
      pull: {
        installationId: 1,
        ingestedAt: "2023-11-14T22:13:20.000Z",
        pull: {
          number: 1,
          title: "n",
          body: "",
          state: "open",
          draft: false,
          htmlUrl: "https://example.com",
          fullName: "oktant/demo",
          baseRef: "main",
          baseSha: "a",
          headRef: "b",
          headSha: "c",
          author: "dev",
          updatedAt: "2023-11-14T22:13:20Z",
        },
        files: [
          addedFile("src/a.ts", [
            "export function run() {",
            "  console.log(1);",
            "  return 1;",
            "}",
          ]),
        ],
        commits: [],
      },
    });
    const suggestions = generateSuggestions({
      findings: report.findings,
      diffs: report.diffs,
      files,
    });
    const attached = attachSuggestionsToReport(report, suggestions);
    expect(attached.comments.some((comment) => comment.body.includes("```diff"))).toBe(true);
  });
});
