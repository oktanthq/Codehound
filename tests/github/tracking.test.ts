import { describe, expect, it } from "vitest";
import { GitHubApp } from "../../src/github/app.js";
import { RepositoryAuthorizer } from "../../src/github/authz.js";
import { InMemorySelectionStore } from "../../src/github/selection.js";
import { BranchTracker, InMemoryRefStore, ZERO_SHA } from "../../src/github/tracking.js";
import { MockHttp } from "../helpers/http.js";
import { generateTestAppKeys } from "../helpers/keys.js";

const NOW = 1_700_000_000;

function isoFromNow(offsetSeconds: number): string {
  return new Date((NOW + offsetSeconds) * 1000).toISOString();
}

function commitPayload(sha: string, message: string, parents: string[] = []) {
  return {
    sha,
    html_url: `https://github.com/oktant/demo/commit/${sha}`,
    commit: {
      message,
      author: {
        name: "dev",
        email: "dev@example.com",
        date: isoFromNow(0),
      },
      committer: {
        name: "dev",
        email: "dev@example.com",
        date: isoFromNow(0),
      },
    },
    parents: parents.map((parent) => ({ sha: parent })),
  };
}

function mockGithub(
  options: {
    branches?: unknown;
    commits?: unknown;
    branchDetail?: unknown;
  } = {},
): MockHttp {
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
        permissions: { contents: "read", metadata: "read" },
        suspended_at: null,
      },
    })
    .on({
      method: "POST",
      urlIncludes: "/app/installations/9/access_tokens",
      body: {
        token: "ghs_track",
        expires_at: isoFromNow(3600),
        permissions: { contents: "read", metadata: "read" },
        repository_selection: "selected",
      },
    })
    .on({
      method: "GET",
      urlIncludes: "/repos/oktant/demo/branches/main",
      body: options.branchDetail ?? {
        name: "main",
        protected: true,
        commit: { sha: "aaa111" },
      },
    })
    .on({
      method: "GET",
      urlIncludes: "/repos/oktant/demo/branches",
      body: options.branches ?? [
        { name: "main", protected: true, commit: { sha: "aaa111" } },
        { name: "dev", protected: false, commit: { sha: "bbb222" } },
      ],
    })
    .on({
      method: "GET",
      urlIncludes: "/repos/oktant/demo/commits",
      body: options.commits ?? [
        commitPayload("aaa111", "head", ["000000"]),
        commitPayload("000000", "init"),
      ],
    })
    .on({
      method: "GET",
      urlIncludes: "/repos/oktant/demo",
      body: {
        id: 55,
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
        size: 1,
      },
    });
  return http;
}

function createTracker(http: MockHttp): BranchTracker {
  const app = GitHubApp.fromEnv(
    {
      GITHUB_APP_ID: "4242",
      GITHUB_APP_PRIVATE_KEY: generateTestAppKeys().privateKeyPkcs8,
    },
    { http, clock: { nowSeconds: () => NOW, now: () => new Date(NOW * 1000) } },
  );
  const selections = new InMemorySelectionStore();
  const authorizer = new RepositoryAuthorizer(app, selections);
  return new BranchTracker(app, authorizer, new InMemoryRefStore(), {
    clock: { nowSeconds: () => NOW, now: () => new Date(NOW * 1000) },
    pageSize: 100,
  });
}

describe("BranchTracker", () => {
  it("syncs branches and commits from GitHub", async () => {
    const tracker = createTracker(mockGithub());
    const results = await tracker.syncRepository(9, "oktant/demo");
    expect(results.map((item) => item.branch.name)).toEqual(["main", "dev"]);
    expect(results[0]?.changed).toBe(true);
    expect(results[0]?.branch.commitSha).toBe("aaa111");
    expect(results[0]?.branch.protected).toBe(true);
    expect(results[0]?.commits[0]?.message).toBe("head");
    expect(await tracker.listBranches(9, "oktant/demo")).toHaveLength(2);
  });

  it("reports unchanged when the branch SHA is already tracked", async () => {
    const tracker = createTracker(mockGithub());
    await tracker.syncBranch(9, "oktant/demo", "main");
    const second = await tracker.syncBranch(9, "oktant/demo", "main");
    expect(second.changed).toBe(false);
    expect(second.commits).toEqual([]);
    expect(second.previousSha).toBe("aaa111");
  });

  it("stops commit listing at the previously tracked SHA", async () => {
    const first = createTracker(
      mockGithub({
        branchDetail: { name: "main", protected: false, commit: { sha: "aaa111" } },
        commits: [commitPayload("aaa111", "first")],
      }),
    );
    await first.syncBranch(9, "oktant/demo", "main");

    const http = mockGithub({
      branchDetail: { name: "main", protected: false, commit: { sha: "ccc333" } },
      commits: [commitPayload("ccc333", "third", ["bbb222"]), commitPayload("aaa111", "first")],
    });
    const app = GitHubApp.fromEnv(
      {
        GITHUB_APP_ID: "4242",
        GITHUB_APP_PRIVATE_KEY: generateTestAppKeys().privateKeyPkcs8,
      },
      { http, clock: { nowSeconds: () => NOW, now: () => new Date(NOW * 1000) } },
    );
    const store = new InMemoryRefStore();
    await store.upsertBranch({
      installationId: 9,
      fullName: "oktant/demo",
      name: "main",
      commitSha: "aaa111",
      protected: false,
      lastIngestedSha: "aaa111",
      lastSyncedAt: isoFromNow(0),
    });
    const tracker = new BranchTracker(
      app,
      new RepositoryAuthorizer(app, new InMemorySelectionStore()),
      store,
      {
        clock: { nowSeconds: () => NOW, now: () => new Date(NOW * 1000) },
      },
    );
    const result = await tracker.syncBranch(9, "oktant/demo", "main");
    expect(result.changed).toBe(true);
    expect(result.commits.map((commit) => commit.sha)).toEqual(["ccc333"]);
    expect(result.branch.lastIngestedSha).toBe("aaa111");
  });

  it("records the ingested SHA without moving the tracked head", async () => {
    const tracker = createTracker(mockGithub());
    await tracker.syncBranch(9, "oktant/demo", "main");
    const recorded = await tracker.recordIngested(9, "oktant/demo", "main", "aaa111");
    expect(recorded.lastIngestedSha).toBe("aaa111");
    expect(recorded.commitSha).toBe("aaa111");
  });

  it("applies a push snapshot and removes deleted branches", async () => {
    const tracker = createTracker(mockGithub());
    const applied = await tracker.applyPush({
      installationId: 9,
      fullName: "oktant/demo",
      branch: "feature",
      before: ZERO_SHA,
      after: "ddd444",
      created: true,
      deleted: false,
      forced: false,
      commits: [
        {
          sha: "ddd444",
          message: "wip",
          authorName: "dev",
          authorEmail: "dev@example.com",
          committedAt: isoFromNow(0),
          parents: [],
          htmlUrl: "https://github.com/oktant/demo/commit/ddd444",
        },
      ],
    });
    expect(applied?.changed).toBe(true);
    expect((await tracker.getBranch(9, "oktant/demo", "feature"))?.commitSha).toBe("ddd444");

    const removed = await tracker.applyPush({
      installationId: 9,
      fullName: "oktant/demo",
      branch: "feature",
      before: "ddd444",
      after: ZERO_SHA,
      created: false,
      deleted: true,
      forced: false,
      commits: [],
    });
    expect(removed).toBeUndefined();
    expect(await tracker.getBranch(9, "oktant/demo", "feature")).toBeUndefined();
  });

  it("drops branches that disappeared on GitHub", async () => {
    const store = new InMemoryRefStore();
    await store.upsertBranch({
      installationId: 9,
      fullName: "oktant/demo",
      name: "gone",
      commitSha: "old",
      protected: false,
      lastIngestedSha: undefined,
      lastSyncedAt: isoFromNow(0),
    });
    const app = GitHubApp.fromEnv(
      {
        GITHUB_APP_ID: "4242",
        GITHUB_APP_PRIVATE_KEY: generateTestAppKeys().privateKeyPkcs8,
      },
      {
        http: mockGithub({
          branches: [{ name: "main", protected: false, commit: { sha: "aaa111" } }],
        }),
        clock: { nowSeconds: () => NOW, now: () => new Date(NOW * 1000) },
      },
    );
    const tracker = new BranchTracker(
      app,
      new RepositoryAuthorizer(app, new InMemorySelectionStore()),
      store,
      {
        clock: { nowSeconds: () => NOW, now: () => new Date(NOW * 1000) },
      },
    );
    await tracker.syncRepository(9, "oktant/demo");
    expect(await tracker.getBranch(9, "oktant/demo", "gone")).toBeUndefined();
    expect((await tracker.listBranches(9, "oktant/demo")).map((branch) => branch.name)).toEqual([
      "main",
    ]);
  });
});
