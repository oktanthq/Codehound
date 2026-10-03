import { describe, expect, it } from "vitest";
import { GitHubApp } from "../../src/github/app.js";
import { RepositoryAuthorizer } from "../../src/github/authz.js";
import { RepositoryDiscovery } from "../../src/github/discovery.js";
import { InMemorySelectionStore } from "../../src/github/selection.js";
import { MockHttp } from "../helpers/http.js";
import { generateTestAppKeys } from "../helpers/keys.js";

const NOW = 1_700_000_000;

function isoFromNow(offsetSeconds: number): string {
  return new Date((NOW + offsetSeconds) * 1000).toISOString();
}

function repo(name: string, overrides: Record<string, unknown> = {}) {
  return {
    id: name.length,
    name,
    full_name: `oktant/${name}`,
    owner: { login: "oktant" },
    private: true,
    fork: false,
    archived: false,
    disabled: false,
    default_branch: "main",
    language: "TypeScript",
    visibility: "private",
    html_url: `https://github.com/oktant/${name}`,
    clone_url: `https://github.com/oktant/${name}.git`,
    size: 10,
    description: `${name} service`,
    ...overrides,
  };
}

function installationAndToken(http: MockHttp): MockHttp {
  return http
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
        token: "ghs_discovery",
        expires_at: isoFromNow(3600),
        permissions: { contents: "read", metadata: "read" },
        repository_selection: "selected",
      },
    });
}

function createDiscovery(http: MockHttp): {
  discovery: RepositoryDiscovery;
  selections: InMemorySelectionStore;
} {
  const app = GitHubApp.fromEnv(
    {
      GITHUB_APP_ID: "4242",
      GITHUB_APP_PRIVATE_KEY: generateTestAppKeys().privateKeyPkcs8,
    },
    { http, clock: { nowSeconds: () => NOW, now: () => new Date(NOW * 1000) } },
  );
  const selections = new InMemorySelectionStore();
  const authorizer = new RepositoryAuthorizer(app, selections);
  const discovery = new RepositoryDiscovery(app, authorizer, selections, {
    clock: { nowSeconds: () => NOW, now: () => new Date(NOW * 1000) },
    pageSize: 1,
  });
  return { discovery, selections };
}

describe("RepositoryDiscovery", () => {
  it("lists and paginates installation repositories", async () => {
    const http = installationAndToken(new MockHttp())
      .on({
        method: "GET",
        urlIncludes: "/installation/repositories?per_page=1&page=1",
        once: true,
        body: { total_count: 2, repositories: [repo("alpha")] },
      })
      .on({
        method: "GET",
        urlIncludes: "/installation/repositories?per_page=1&page=2",
        body: { total_count: 2, repositories: [repo("beta")] },
      });
    const { discovery } = createDiscovery(http);
    const repos = await discovery.listAccessible(9);
    expect(repos.map((item) => item.name)).toEqual(["alpha", "beta"]);
    expect(repos[0]?.selected).toBe(false);
    expect(repos[0]?.description).toBe("alpha service");
  });

  it("filters by query, language, visibility, and archived", async () => {
    const http = installationAndToken(new MockHttp()).on({
      method: "GET",
      urlIncludes: "/installation/repositories",
      body: {
        total_count: 4,
        repositories: [
          repo("api", {
            language: "TypeScript",
            description: "public api",
            visibility: "public",
            private: false,
          }),
          repo("legacy", { language: "Python", archived: true }),
          repo("forked", { fork: true, language: "TypeScript" }),
          repo("secret", { language: "Go", visibility: "private" }),
        ],
      },
    });
    const { discovery } = createDiscovery(http);

    const byQuery = await discovery.listAccessible(9, { query: "public api" });
    expect(byQuery.map((item) => item.name)).toEqual(["api"]);

    const typescript = await discovery.listAccessible(9, {
      language: "typescript",
      includeForks: false,
    });
    expect(typescript.map((item) => item.name)).toEqual(["api"]);

    const archived = await discovery.listAccessible(9, {
      includeArchived: true,
      language: "Python",
    });
    expect(archived.map((item) => item.name)).toEqual(["legacy"]);

    const publics = await discovery.listAccessible(9, { visibility: "public" });
    expect(publics.map((item) => item.name)).toEqual(["api"]);
  });

  it("selects an accessible repository and lists the selection", async () => {
    const http = installationAndToken(new MockHttp()).on({
      method: "GET",
      urlIncludes: "/repos/oktant/alpha",
      body: repo("alpha"),
    });
    const { discovery } = createDiscovery(http);
    const selected = await discovery.select(9, "oktant/alpha");
    expect(selected.fullName).toBe("oktant/alpha");
    expect(selected.installationId).toBe(9);
    expect(await discovery.listSelected(9)).toEqual([selected]);

    const again = await discovery.select(9, "oktant/alpha");
    expect(again.selectedAt).toBe(selected.selectedAt);
  });

  it("marks discovered repositories as selected", async () => {
    const http = installationAndToken(new MockHttp())
      .on({
        method: "GET",
        urlIncludes: "/repos/oktant/alpha",
        body: repo("alpha"),
      })
      .on({
        method: "GET",
        urlIncludes: "/installation/repositories",
        body: { total_count: 1, repositories: [repo("alpha")] },
      });
    const { discovery } = createDiscovery(http);
    await discovery.select(9, "oktant/alpha");
    const repos = await discovery.listAccessible(9);
    expect(repos[0]?.selected).toBe(true);
  });

  it("refuses to select a repository the installation cannot access", async () => {
    const http = installationAndToken(new MockHttp()).on({
      method: "GET",
      urlIncludes: "/repos/oktant/secret",
      status: 404,
      body: { message: "Not Found" },
    });
    const { discovery } = createDiscovery(http);
    await expect(discovery.select(9, "oktant/secret")).rejects.toMatchObject({
      code: "REPOSITORY_NOT_ACCESSIBLE",
    });
    expect(await discovery.listSelected(9)).toEqual([]);
  });

  it("deselects a repository", async () => {
    const http = installationAndToken(new MockHttp()).on({
      method: "GET",
      urlIncludes: "/repos/oktant/alpha",
      body: repo("alpha"),
    });
    const { discovery } = createDiscovery(http);
    await discovery.select(9, "oktant/alpha");
    expect(await discovery.deselect(9, "oktant/alpha")).toBe(true);
    expect(await discovery.listSelected(9)).toEqual([]);
    expect(await discovery.deselect(9, "oktant/alpha")).toBe(false);
  });
});
