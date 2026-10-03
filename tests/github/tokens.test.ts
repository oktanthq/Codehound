import { describe, expect, it } from "vitest";
import { GitHubApp } from "../../src/github/app.js";
import { GitHubAppError } from "../../src/github/errors.js";
import { bearerToken, MockHttp } from "../helpers/http.js";
import { generateTestAppKeys } from "../helpers/keys.js";

const NOW = 1_700_000_000;

function isoFromNow(offsetSeconds: number): string {
  return new Date((NOW + offsetSeconds) * 1000).toISOString();
}

function appWithHttp(http: MockHttp): GitHubApp {
  const keys = generateTestAppKeys();
  return GitHubApp.fromEnv(
    {
      GITHUB_APP_ID: "4242",
      GITHUB_APP_PRIVATE_KEY: keys.privateKeyPkcs8,
    },
    { http, clock: { nowSeconds: () => NOW, now: () => new Date(NOW * 1000) } },
  );
}

describe("InstallationTokenClient", () => {
  it("exchanges an app JWT for an installation token", async () => {
    const http = new MockHttp().on({
      method: "POST",
      urlIncludes: "/app/installations/77/access_tokens",
      body: {
        token: "ghs_test_token",
        expires_at: isoFromNow(3600),
        permissions: { contents: "read", metadata: "read" },
        repository_selection: "selected",
      },
    });
    const app = appWithHttp(http);
    const token = await app.getInstallationToken(77);

    expect(token.token).toBe("ghs_test_token");
    expect(token.installationId).toBe(77);
    expect(token.permissions.contents).toBe("read");
    expect(token.repositorySelection).toBe("selected");
    expect(http.calls).toHaveLength(1);
    const jwt = bearerToken(http.calls[0]!);
    expect(jwt).toBeTruthy();
    expect(jwt?.split(".")).toHaveLength(3);
  });

  it("caches tokens until they are close to expiry", async () => {
    const http = new MockHttp().on({
      method: "POST",
      urlIncludes: "/app/installations/77/access_tokens",
      body: {
        token: "ghs_cached",
        expires_at: isoFromNow(3600),
        permissions: { contents: "read" },
        repository_selection: "all",
      },
    });
    const app = appWithHttp(http);
    const first = await app.getInstallationToken(77);
    const second = await app.getInstallationToken(77);
    expect(first.token).toBe("ghs_cached");
    expect(second.token).toBe("ghs_cached");
    expect(http.calls).toHaveLength(1);
  });

  it("refreshes a token that is within the skew window", async () => {
    const http = new MockHttp()
      .on({
        method: "POST",
        urlIncludes: "/app/installations/77/access_tokens",
        once: true,
        body: {
          token: "ghs_old",
          expires_at: isoFromNow(40),
          permissions: { contents: "read" },
          repository_selection: "all",
        },
      })
      .on({
        method: "POST",
        urlIncludes: "/app/installations/77/access_tokens",
        body: {
          token: "ghs_new",
          expires_at: isoFromNow(3600),
          permissions: { contents: "read" },
          repository_selection: "all",
        },
      });
    const app = appWithHttp(http);
    const first = await app.getInstallationToken(77);
    const second = await app.getInstallationToken(77);
    expect(first.token).toBe("ghs_old");
    expect(second.token).toBe("ghs_new");
    expect(http.calls).toHaveLength(2);
  });

  it("maps a missing installation to INSTALLATION_NOT_FOUND", async () => {
    const http = new MockHttp().on({
      method: "POST",
      urlIncludes: "/app/installations/404/access_tokens",
      status: 404,
      body: { message: "Not Found" },
    });
    const app = appWithHttp(http);
    await expect(app.getInstallationToken(404)).rejects.toMatchObject({
      code: "INSTALLATION_NOT_FOUND",
      status: 404,
    } satisfies Partial<GitHubAppError>);
  });

  it("redacts the app JWT when GitHub echoes it", async () => {
    const http = {
      async request(req: { headers?: Record<string, string> }) {
        const authorization = req.headers?.authorization ?? "";
        return {
          status: 401,
          headers: {},
          body: JSON.stringify({ message: `rejected ${authorization}` }),
        };
      },
    };
    const app = GitHubApp.fromEnv(
      {
        GITHUB_APP_ID: "4242",
        GITHUB_APP_PRIVATE_KEY: generateTestAppKeys().privateKeyPkcs8,
      },
      { http },
    );
    await expect(app.getInstallationToken(77)).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(GitHubAppError);
      const message = (error as GitHubAppError).message;
      expect(message).toContain("[redacted]");
      expect(message).not.toMatch(/eyJ/);
      expect(message).not.toContain("BEGIN PRIVATE KEY");
      return true;
    });
  });
});

describe("GitHubApp.getInstallation", () => {
  it("returns an active installation", async () => {
    const http = new MockHttp().on({
      method: "GET",
      urlIncludes: "/app/installations/12",
      body: {
        id: 12,
        account: { id: 1, login: "oktant", type: "Organization" },
        app_id: 4242,
        target_type: "Organization",
        repository_selection: "selected",
        permissions: { contents: "read", metadata: "read" },
        suspended_at: null,
      },
    });
    const app = appWithHttp(http);
    const installation = await app.getInstallation(12);
    expect(installation.account.login).toBe("oktant");
    expect(installation.permissions.contents).toBe("read");
  });

  it("rejects suspended installations", async () => {
    const http = new MockHttp().on({
      method: "GET",
      urlIncludes: "/app/installations/12",
      body: {
        id: 12,
        account: { id: 1, login: "oktant", type: "Organization" },
        app_id: 4242,
        target_type: "Organization",
        repository_selection: "all",
        permissions: { contents: "read" },
        suspended_at: "2023-11-14T00:00:00Z",
      },
    });
    const app = appWithHttp(http);
    await expect(app.getInstallation(12)).rejects.toMatchObject({
      code: "INSTALLATION_SUSPENDED",
    } satisfies Partial<GitHubAppError>);
  });
});
