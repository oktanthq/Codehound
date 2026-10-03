import { describe, expect, it } from "vitest";
import { GitHubApp } from "../../src/github/app.js";
import { RepositoryAuthorizer } from "../../src/github/authz.js";
import { GitHubAppError } from "../../src/github/errors.js";
import { InMemorySelectionStore } from "../../src/github/selection.js";
import { MockHttp } from "../helpers/http.js";
import { generateTestAppKeys } from "../helpers/keys.js";

const NOW = 1_700_000_000;

function isoFromNow(offsetSeconds: number): string {
  return new Date((NOW + offsetSeconds) * 1000).toISOString();
}

function githubRepo(overrides: Record<string, unknown> = {}) {
  return {
    id: 101,
    name: "codehound",
    full_name: "oktant/codehound",
    owner: { login: "oktant" },
    private: true,
    fork: false,
    archived: false,
    disabled: false,
    default_branch: "main",
    language: "TypeScript",
    visibility: "private",
    html_url: "https://github.com/oktant/codehound",
    clone_url: "https://github.com/oktant/codehound.git",
    size: 42,
    ...overrides,
  };
}

function createApp(http: MockHttp): GitHubApp {
  return GitHubApp.fromEnv(
    {
      GITHUB_APP_ID: "4242",
      GITHUB_APP_PRIVATE_KEY: generateTestAppKeys().privateKeyPkcs8,
    },
    { http, clock: { nowSeconds: () => NOW, now: () => new Date(NOW * 1000) } },
  );
}

function mockAccess(
  options: {
    suspendedAt?: string | null;
    tokenPermissions?: Record<string, string>;
    repoStatus?: number;
    repoBody?: unknown;
  } = {},
): MockHttp {
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
        permissions: { contents: "write", metadata: "read", pull_requests: "write" },
        suspended_at: options.suspendedAt === undefined ? null : options.suspendedAt,
      },
    })
    .on({
      method: "POST",
      urlIncludes: "/app/installations/9/access_tokens",
      body: {
        token: "ghs_authz",
        expires_at: isoFromNow(3600),
        permissions: options.tokenPermissions ?? { contents: "read", metadata: "read" },
        repository_selection: "selected",
      },
    })
    .on({
      method: "GET",
      urlIncludes: "/repos/oktant/codehound",
      status: options.repoStatus ?? 200,
      body: options.repoBody ?? githubRepo(),
    });
}

describe("RepositoryAuthorizer", () => {
  it("allows access when the installation can see the repository", async () => {
    const app = createApp(mockAccess());
    const authorizer = new RepositoryAuthorizer(app);
    const decision = await authorizer.authorize({
      installationId: 9,
      owner: "oktant",
      repo: "codehound",
      requiredPermissions: { contents: "read" },
    });

    expect(decision.allowed).toBe(true);
    if (decision.allowed) {
      expect(decision.repository.fullName).toBe("oktant/codehound");
      expect(decision.repository.visibility).toBe("private");
      expect(decision.installation.account.login).toBe("oktant");
      expect(decision.permissions.contents).toBe("read");
    }
  });

  it("accepts owner/name via fullName", async () => {
    const app = createApp(mockAccess());
    const access = await new RepositoryAuthorizer(app).assertAuthorized({
      installationId: 9,
      fullName: "oktant/codehound",
    });
    expect(access.repository.name).toBe("codehound");
  });

  it("treats GitHub 404 as not accessible", async () => {
    const app = createApp(mockAccess({ repoStatus: 404, repoBody: { message: "Not Found" } }));
    const decision = await new RepositoryAuthorizer(app).authorize({
      installationId: 9,
      fullName: "oktant/codehound",
    });
    expect(decision).toMatchObject({ allowed: false, reason: "REPOSITORY_NOT_ACCESSIBLE" });
  });

  it("denies insufficient permission ranks", async () => {
    const app = createApp(mockAccess({ tokenPermissions: { contents: "read", metadata: "read" } }));
    const decision = await new RepositoryAuthorizer(app).authorize({
      installationId: 9,
      fullName: "oktant/codehound",
      requiredPermissions: { contents: "write" },
    });
    expect(decision).toMatchObject({ allowed: false, reason: "INSUFFICIENT_PERMISSION" });
    if (!decision.allowed) {
      expect(decision.message).toContain("contents:write");
    }
  });

  it("allows write when the token has admin", async () => {
    const app = createApp(
      mockAccess({ tokenPermissions: { contents: "admin", metadata: "read" } }),
    );
    const decision = await new RepositoryAuthorizer(app).authorize({
      installationId: 9,
      fullName: "oktant/codehound",
      requiredPermissions: { contents: "write" },
    });
    expect(decision.allowed).toBe(true);
  });

  it("denies suspended installations", async () => {
    const app = createApp(mockAccess({ suspendedAt: "2023-11-14T00:00:00Z" }));
    const decision = await new RepositoryAuthorizer(app).authorize({
      installationId: 9,
      fullName: "oktant/codehound",
    });
    expect(decision).toMatchObject({ allowed: false, reason: "INSTALLATION_SUSPENDED" });
  });

  it("denies disabled repositories", async () => {
    const app = createApp(mockAccess({ repoBody: githubRepo({ disabled: true }) }));
    const decision = await new RepositoryAuthorizer(app).authorize({
      installationId: 9,
      fullName: "oktant/codehound",
    });
    expect(decision).toMatchObject({ allowed: false, reason: "REPOSITORY_DISABLED" });
  });

  it("requires an explicit selection when asked", async () => {
    const app = createApp(mockAccess());
    const selections = new InMemorySelectionStore();
    const authorizer = new RepositoryAuthorizer(app, selections);

    const denied = await authorizer.authorize({
      installationId: 9,
      fullName: "oktant/codehound",
      requireSelected: true,
    });
    expect(denied).toMatchObject({ allowed: false, reason: "REPOSITORY_NOT_SELECTED" });

    await selections.add({
      installationId: 9,
      fullName: "oktant/codehound",
      owner: "oktant",
      name: "codehound",
      selectedAt: new Date(NOW * 1000).toISOString(),
    });
    const allowed = await authorizer.authorize({
      installationId: 9,
      fullName: "oktant/codehound",
      requireSelected: true,
    });
    expect(allowed.allowed).toBe(true);
  });

  it("throws on assertAuthorized when access is denied", async () => {
    const app = createApp(mockAccess({ repoStatus: 403, repoBody: { message: "Forbidden" } }));
    await expect(
      new RepositoryAuthorizer(app).assertAuthorized({
        installationId: 9,
        fullName: "oktant/codehound",
      }),
    ).rejects.toBeInstanceOf(GitHubAppError);
  });
});
