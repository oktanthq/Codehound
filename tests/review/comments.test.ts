import { describe, expect, it } from "vitest";
import { commentsFromFindings, formatFindingComment } from "../../src/review/comments.js";
import { makeFinding } from "../../src/review/findings.js";

describe("automated review comments", () => {
  it("renders markdown comments grouped by file and line", () => {
    const finding = makeFinding({
      category: "practice",
      ruleId: "practice.console",
      severity: "low",
      title: "Console usage",
      message: "Avoid console.log.",
      path: "src/a.ts",
      startLine: 4,
      evidence: "console.log(1);",
    });
    const body = formatFindingComment(finding);
    expect(body).toContain("[low] Console usage");
    expect(body).toContain("src/a.ts:4");
    expect(body).toContain("console.log(1);");
    const comments = commentsFromFindings([
      finding,
      makeFinding({
        category: "smell",
        ruleId: "smell.todo",
        severity: "info",
        title: "Leftover work marker",
        message: "TODO",
        path: "src/a.ts",
        startLine: 4,
      }),
    ]);
    expect(comments).toHaveLength(1);
    expect(comments[0]?.findingIds).toHaveLength(2);
  });
});
