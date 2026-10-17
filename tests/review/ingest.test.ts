import { describe, expect, it } from "vitest";
import { GitHubApp } from "../../src/github/app.js";
import { RepositoryAuthorizer } from "../../src/github/authz.js";
import { InMemorySelectionStore } from "../../src/github/selection.js";
import { InMemoryPullStore } from "../../src/review/store.js";
import { PullRequestIngestor } from "../../src/review/ingest.js";
import { MockHttp } from "../helpers/http.js";
import { generateTestAppKeys } from "../helpers/keys.js";

const NOW = 1_700_000_000;

function isoFromNow(offsetSeconds: number): string {
  return new Date((NOW + offsetSeconds) * 1000).toISOString();
}

function mockGithub(): MockHttp {
  return new MockHttp()
    .on({
      method: "GET",
      urlIncludes: "/app/installations/9",
      body: {
        id: 9,
        account: { id: 1, login: "oktant", type: "Organization" },
        app_id: 4242,
        target_type: "Organization",
        repository_selection: "selected",
        permissions: { contents: "read", metadata: "read", pull_requests: "read" },
        suspended_at: null,
      },
    })
    .on({
      method: "POST",
      urlIncludes: "/app/installations/9/access_tokens",
      body: {
        token: "ghs_pull",
        expires_at: isoFromNow(3600),
        permissions: { contents: "read", metadata: "read", pull_requests: "read" },
        repository_selection: "selected",
      },
    })
    .on({
      method: "GET",
      urlIncludes: "/repos/oktant/demo/pulls/12/files",
      body: [
        {
          filename: "src/greet.ts",
          status: "modified",
          additions: 1,
          deletions: 1,
          patch:
            "@@ -1,1 +1,1 @@\n-export function greet() { return 1; }\n+export function greet() { return 2; }",
        },
      ],
    })
    .on({
      method: "GET",
      urlIncludes: "/repos/oktant/demo/pulls/12/commits",
      body: [
        {
          sha: "bbb",
          commit: { message: "change greet", author: { name: "dev" } },
        },
      ],
    })
    .on({
      method: "GET",
      urlIncludes: "/repos/oktant/demo/pulls/12",
      body: {
        number: 12,
        title: "Change greet",
        body: "return 2",
        state: "open",
        draft: false,
        html_url: "https://github.com/oktant/demo/pull/12",
        updated_at: "2023-11-14T22:13:20Z",
        user: { login: "dev" },
        base: { ref: "main", sha: "aaa", repo: { full_name: "oktant/demo" } },
        head: { ref: "feat", sha: "bbb" },
      },
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
}

describe("PullRequestIngestor", () => {
  it("fetches a pull request, files, and commits and stores them", async () => {
    const http = mockGithub();
    const app = GitHubApp.fromEnv(
      {
        GITHUB_APP_ID: "4242",
        GITHUB_APP_PRIVATE_KEY: generateTestAppKeys().privateKeyPkcs8,
      },
      { http, clock: { nowSeconds: () => NOW, now: () => new Date(NOW * 1000) } },
    );
    const store = new InMemoryPullStore();
    const ingestor = new PullRequestIngestor(
      app,
      new RepositoryAuthorizer(app, new InMemorySelectionStore()),
      store,
      { clock: { nowSeconds: () => NOW, now: () => new Date(NOW * 1000) } },
    );
    const ingested = await ingestor.ingest({
      installationId: 9,
      fullName: "oktant/demo",
      number: 12,
    });
    expect(ingested.pull.title).toBe("Change greet");
    expect(ingested.files[0]?.path).toBe("src/greet.ts");
    expect(ingested.commits[0]?.sha).toBe("bbb");
    expect((await store.get("oktant/demo", 12))?.pull.headSha).toBe("bbb");

    const synced = await ingestor.syncWebhook({
      type: "pull_request",
      deliveryId: "d1",
      installationId: 9,
      fullName: "oktant/demo",
      action: "synchronize",
      number: 12,
      title: "Change greet",
      state: "open",
      draft: false,
      baseRef: "main",
      baseSha: "aaa",
      headRef: "feat",
      headSha: "bbb",
      htmlUrl: "https://github.com/oktant/demo/pull/12",
      author: "dev",
    });
    expect(synced?.pull.number).toBe(12);
  });
});
