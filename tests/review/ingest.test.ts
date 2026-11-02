import { describe, expect, it } from "vitest";
import { GitHubApp } from "../../src/github/app.js";
import { RepositoryAuthorizer } from "../../src/github/authz.js";
import { InMemorySelectionStore } from "../../src/github/selection.js";
import { GITHUB_PR_FILES_LIMIT, PullRequestIngestor } from "../../src/review/ingest.js";
import { InMemoryPullStore } from "../../src/review/store.js";
import { MockHttp } from "../helpers/http.js";
import { generateTestAppKeys } from "../helpers/keys.js";

const NOW = 1_700_000_000;

function isoFromNow(offsetSeconds: number): string {
  return new Date((NOW + offsetSeconds) * 1000).toISOString();
}

const DEFAULT_FILES = [
  {
    filename: "src/greet.ts",
    status: "modified",
    additions: 1,
    deletions: 1,
    patch:
      "@@ -1,1 +1,1 @@\n-export function greet() { return 1; }\n+export function greet() { return 2; }",
  },
];

const DEFAULT_COMMITS = [
  {
    sha: "bbb",
    commit: { message: "change greet", author: { name: "dev" } },
  },
];

function mockGithub(
  options: {
    files?: unknown[];
    commits?: unknown[];
    repeatingFiles?: unknown[];
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
    });

  if (options.repeatingFiles !== undefined) {
    http.on({
      method: "GET",
      urlIncludes: "/repos/oktant/demo/pulls/12/files",
      body: options.repeatingFiles,
    });
  } else {
    onPaged(http, "/repos/oktant/demo/pulls/12/files", options.files ?? DEFAULT_FILES);
  }
  onPaged(http, "/repos/oktant/demo/pulls/12/commits", options.commits ?? DEFAULT_COMMITS);

  return http
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

function filePayload(path: string) {
  return { filename: path, status: "added", additions: 1, deletions: 0 };
}

function commitPayload(sha: string) {
  return { sha, commit: { message: `commit ${sha}`, author: { name: "dev" } } };
}

function onPaged(http: MockHttp, path: string, items: unknown[], pageSize = 100): MockHttp {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  for (let page = 1; page <= pageCount; page += 1) {
    const start = (page - 1) * pageSize;
    http.on({
      method: "GET",
      urlIncludes: `${path}?per_page=${pageSize}&page=${page}`,
      body: items.slice(start, start + pageSize),
    });
  }
  return http;
}

function createIngestor(http: MockHttp): {
  ingestor: PullRequestIngestor;
  store: InMemoryPullStore;
} {
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
  return { ingestor, store };
}

function countCalls(http: MockHttp, urlIncludes: string): number {
  return http.calls.filter((call) => call.method === "GET" && call.url.includes(urlIncludes))
    .length;
}

describe("PullRequestIngestor", () => {
  it("fetches a pull request, files, and commits and stores them", async () => {
    const http = mockGithub();
    const { ingestor, store } = createIngestor(http);
    const ingested = await ingestor.ingest({
      installationId: 9,
      fullName: "oktant/demo",
      number: 12,
    });
    expect(ingested.pull.title).toBe("Change greet");
    expect(ingested.files[0]?.path).toBe("src/greet.ts");
    expect(ingested.commits[0]?.sha).toBe("bbb");
    expect(ingested.truncated).toBe(false);
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

  it("stores 250 files fetched across 3 pages", async () => {
    const files = Array.from({ length: 250 }, (_, index) => filePayload(`src/f${index}.ts`));
    const http = mockGithub({ files });
    const { ingestor, store } = createIngestor(http);
    const ingested = await ingestor.ingest({
      installationId: 9,
      fullName: "oktant/demo",
      number: 12,
    });
    expect(ingested.files).toHaveLength(250);
    expect(ingested.files[0]?.path).toBe("src/f0.ts");
    expect(ingested.files[249]?.path).toBe("src/f249.ts");
    expect(ingested.truncated).toBe(false);
    expect((await store.get("oktant/demo", 12))?.files).toHaveLength(250);
    expect(countCalls(http, "/repos/oktant/demo/pulls/12/files")).toBe(3);
  });

  it("stores 130 commits fetched across 2 pages", async () => {
    const commits = Array.from({ length: 130 }, (_, index) =>
      commitPayload(`c${index.toString(16).padStart(4, "0")}`),
    );
    const http = mockGithub({ commits });
    const { ingestor } = createIngestor(http);
    const ingested = await ingestor.ingest({
      installationId: 9,
      fullName: "oktant/demo",
      number: 12,
    });
    expect(ingested.commits).toHaveLength(130);
    expect(ingested.commits[0]?.sha).toBe("c0000");
    expect(ingested.commits[129]?.sha).toBe("c0081");
    expect(ingested.truncated).toBe(false);
    expect(countCalls(http, "/repos/oktant/demo/pulls/12/commits")).toBe(2);
  });

  it("marks a pull truncated when GitHub's file cap is reached", async () => {
    const files = Array.from({ length: GITHUB_PR_FILES_LIMIT }, (_, index) =>
      filePayload(`src/cap${index}.ts`),
    );
    const http = mockGithub({ files });
    const { ingestor } = createIngestor(http);
    const ingested = await ingestor.ingest({
      installationId: 9,
      fullName: "oktant/demo",
      number: 12,
    });
    expect(ingested.files).toHaveLength(GITHUB_PR_FILES_LIMIT);
    expect(ingested.truncated).toBe(true);
    expect(countCalls(http, "/repos/oktant/demo/pulls/12/files")).toBe(30);
  });

  it("bounds file listing when the API keeps returning full pages", async () => {
    const http = mockGithub({
      repeatingFiles: Array.from({ length: 100 }, (_, index) => filePayload(`src/loop${index}.ts`)),
    });
    const { ingestor } = createIngestor(http);
    const ingested = await ingestor.ingest({
      installationId: 9,
      fullName: "oktant/demo",
      number: 12,
    });
    expect(ingested.files).toHaveLength(GITHUB_PR_FILES_LIMIT);
    expect(ingested.truncated).toBe(true);
    expect(countCalls(http, "/repos/oktant/demo/pulls/12/files")).toBe(30);
  });
});
