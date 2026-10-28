import { describe, expect, it } from "vitest";
import { GitHubApp } from "../../src/github/app.js";
import { RepositoryAuthorizer } from "../../src/github/authz.js";
import { InMemorySelectionStore } from "../../src/github/selection.js";
import { reviewPull } from "../../src/review/engine.js";
import { GitHubReviewPublisher } from "../../src/review/publish.js";
import { MockHttp } from "../helpers/http.js";
import { generateTestAppKeys } from "../helpers/keys.js";
import { addedFile } from "./helpers.js";

const NOW = 1_700_000_000;

function isoFromNow(offsetSeconds: number): string {
  return new Date((NOW + offsetSeconds) * 1000).toISOString();
}

describe("GitHub PR review integration", () => {
  it("posts a review with inline comments", async () => {
    const http = new MockHttp()
      .on({
        method: "GET",
        urlIncludes: "/app/installations/9",
        body: {
          id: 9,
          account: { id: 1, login: "oktant", type: "Organization" },
          app_id: 4242,
          target_type: "Organization",
          repository_selection: "selected",
          permissions: { contents: "read", metadata: "read", pull_requests: "write" },
          suspended_at: null,
        },
      })
      .on({
        method: "POST",
        urlIncludes: "/app/installations/9/access_tokens",
        body: {
          token: "ghs_review",
          expires_at: isoFromNow(3600),
          permissions: { contents: "read", metadata: "read", pull_requests: "write" },
          repository_selection: "selected",
        },
      })
      .on({
        method: "POST",
        urlIncludes: "/repos/oktant/demo/pulls/12/reviews",
        body: { id: 88, html_url: "https://github.com/oktant/demo/pull/12#review-88" },
      })
      .on({
        method: "GET",
        urlIncludes: "/repos/oktant/demo",
        body: {
          id: 1,
          name: "demo",
          full_name: "oktant/demo",
          owner: { login: "oktant" },
          private: true,
          fork: false,
          archived: false,
          disabled: false,
          default_branch: "main",
          language: "TypeScript",
          visibility: "private",
          html_url: "https://github.com/oktant/demo",
          clone_url: "https://github.com/oktant/demo.git",
          size: 10,
        },
      });
    const app = GitHubApp.fromEnv(
      {
        GITHUB_APP_ID: "4242",
        GITHUB_APP_PRIVATE_KEY: generateTestAppKeys().privateKeyPkcs8,
      },
      { http, clock: { nowSeconds: () => NOW, now: () => new Date(NOW * 1000) } },
    );
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
      files: [addedFile("src/bad.ts", ["eval(x);"])],
      commits: [],
    };
    const report = reviewPull({ pull });
    const published = await new GitHubReviewPublisher(
      app,
      new RepositoryAuthorizer(app, new InMemorySelectionStore()),
    ).publish(pull, report);
    expect(published.id).toBe(88);
    expect(published.event).toBe("REQUEST_CHANGES");
    expect(published.commentCount).toBeGreaterThan(0);
    const posted = http.calls.find(
      (call) => call.method === "POST" && call.url.includes("/reviews"),
    );
    expect(posted?.body).toContain("eval");
  });
});
