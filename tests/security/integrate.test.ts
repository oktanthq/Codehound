import { describe, expect, it } from "vitest";
import { reviewPull } from "../../src/review/engine.js";
import { mergeSecurityIntoReview } from "../../src/security/integrate.js";
import { makeVulnerability } from "../../src/security/types.js";
import { addedFile } from "../review/helpers.js";

describe("security findings in PR reviews", () => {
  it("merges repository scan findings into comments for changed paths", () => {
    const report = reviewPull({
      pull: {
        installationId: 1,
        ingestedAt: "2023-11-14T22:13:20.000Z",
        pull: {
          number: 4,
          title: "routes",
          body: "",
          state: "open",
          draft: false,
          htmlUrl: "https://github.com/oktant/demo/pull/4",
          fullName: "oktant/demo",
          baseRef: "main",
          baseSha: "aaa",
          headRef: "feat",
          headSha: "bbb",
          author: "dev",
          updatedAt: "2023-11-14T22:13:20Z",
        },
        files: [addedFile("src/routes.ts", ["export const n = 1;"])],
        commits: [],
      },
    });
    const merged = mergeSecurityIntoReview(report, [
      makeVulnerability({
        category: "auth",
        ruleId: "auth.unprotected-endpoint",
        severity: "high",
        title: "Endpoint missing authorization",
        message: "POST /orders has no auth check.",
        path: "src/routes.ts",
        startLine: 1,
        cwe: "CWE-306",
      }),
      makeVulnerability({
        category: "secret",
        ruleId: "secret.hardcoded",
        severity: "critical",
        title: "Hardcoded credential",
        message: "secret",
        path: "src/other.ts",
        startLine: 2,
      }),
    ]);
    expect(merged.findings.some((finding) => finding.ruleId === "auth.unprotected-endpoint")).toBe(
      true,
    );
    expect(merged.findings.some((finding) => finding.path === "src/other.ts")).toBe(false);
    expect(merged.comments.some((comment) => comment.body.includes("auth.unprotected-endpoint"))).toBe(
      true,
    );
    expect(merged.summary.event).toBe("REQUEST_CHANGES");
  });

  it("accepts security findings on reviewPull", () => {
    const report = reviewPull({
      diffs: [],
      files: new Map(),
      securityFindings: [
        makeVulnerability({
          category: "injection",
          ruleId: "injection.sql",
          severity: "critical",
          title: "SQL injection",
          message: "concatenated SQL",
          path: "src/db.ts",
          startLine: 4,
          cwe: "CWE-89",
        }),
      ],
    });
    expect(report.findings.some((finding) => finding.ruleId === "injection.sql")).toBe(true);
    expect(report.findings[0]?.category).toBe("security");
  });
});
