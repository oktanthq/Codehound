import { describe, expect, it } from "vitest";
import { GitHubApi } from "../../src/github/api.js";
import { GitHubApp } from "../../src/github/app.js";
import { RepositoryAuthorizer } from "../../src/github/authz.js";
import { loadGitHubAppConfig } from "../../src/github/config.js";
import { RepositoryDiscovery } from "../../src/github/discovery.js";
import { createFetchHttpClient } from "../../src/github/http.js";
import { InMemorySelectionStore } from "../../src/github/selection.js";
import { parseRepositoryFullName } from "../../src/github/types.js";
import { PullRequestIngestor } from "../../src/review/ingest.js";
import { GitHubReviewPublisher } from "../../src/review/publish.js";
import { InMemoryPullStore } from "../../src/review/store.js";
import { emptyCounts } from "../../src/review/summary.js";

type LiveEnv = {
  repo: string;
  installationId: number | undefined;
  pullNumber: number | undefined;
};

function readOptional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value === undefined || value.length === 0 ? undefined : value;
}

function readLiveEnv(): LiveEnv | undefined {
  const appId = readOptional("GITHUB_APP_ID");
  const privateKey = readOptional("GITHUB_APP_PRIVATE_KEY");
  const webhookSecret = readOptional("GITHUB_APP_WEBHOOK_SECRET");
  const repo = readOptional("GITHUB_TEST_REPO");
  if (
    appId === undefined ||
    privateKey === undefined ||
    webhookSecret === undefined ||
    repo === undefined
  ) {
    return undefined;
  }
  const installationRaw = readOptional("GITHUB_TEST_INSTALLATION_ID");
  const pullRaw = readOptional("GITHUB_TEST_PULL_NUMBER");
  const installationId =
    installationRaw === undefined ? undefined : Number.parseInt(installationRaw, 10);
  const pullNumber = pullRaw === undefined ? undefined : Number.parseInt(pullRaw, 10);
  return {
    repo,
    installationId:
      installationId !== undefined && Number.isInteger(installationId) ? installationId : undefined,
    pullNumber: pullNumber !== undefined && Number.isInteger(pullNumber) ? pullNumber : undefined,
  };
}

function createLiveClients() {
  const http = createFetchHttpClient();
  const app = GitHubApp.fromEnv(process.env, { http });
  const api = new GitHubApi(loadGitHubAppConfig(), http);
  const authorizer = new RepositoryAuthorizer(app, new InMemorySelectionStore());
  const discovery = new RepositoryDiscovery(app, authorizer, new InMemorySelectionStore());
  return { app, api, authorizer, discovery };
}

const live = readLiveEnv();

describe("live GitHub App", () => {
  async function resolveInstallationId(app: GitHubApp, api: GitHubApi): Promise<number> {
    if (live?.installationId !== undefined) {
      return live.installationId;
    }
    const jwt = await app.createAppJwt();
    const listed = await api.request<{ id: number }[]>({
      method: "GET",
      path: "/app/installations",
      token: jwt.token,
    });
    const first = listed.data[0]?.id;
    if (first === undefined) {
      throw new Error("GitHub App has no installations");
    }
    return first;
  }

  async function resolvePullNumber(
    app: GitHubApp,
    installationId: number,
  ): Promise<number | undefined> {
    if (live?.pullNumber !== undefined) {
      return live.pullNumber;
    }
    if (live === undefined) {
      return undefined;
    }
    const { owner, name } = parseRepositoryFullName(live.repo);
    const pulls = await app.requestAsInstallation<{ number: number }[]>(installationId, {
      method: "GET",
      path: `/repos/${owner}/${name}/pulls`,
      query: { state: "open", per_page: 1 },
    });
    return pulls.data[0]?.number;
  }

  it("skips without live GitHub credentials", () => {
    if (live === undefined) {
      expect(live).toBeUndefined();
      return;
    }
    expect(live.repo.includes("/")).toBe(true);
  });

  it.skipIf(live === undefined)("mints an installation token", async () => {
    const { app, api } = createLiveClients();
    const installationId = await resolveInstallationId(app, api);
    const token = await app.getInstallationToken(installationId);
    expect(token.installationId).toBe(installationId);
    expect(token.token.length).toBeGreaterThan(0);
    expect(token.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it.skipIf(live === undefined)("lists installation repositories", async () => {
    const { app, api, discovery } = createLiveClients();
    const installationId = await resolveInstallationId(app, api);
    const repos = await discovery.listAccessible(installationId);
    expect(repos.length).toBeGreaterThan(0);
    expect(repos.some((repo) => repo.fullName.toLowerCase() === live?.repo.toLowerCase())).toBe(
      true,
    );
  });

  it.skipIf(live === undefined)(
    "ingests a pull request from the sandbox repository",
    async (context) => {
      const { app, api, authorizer } = createLiveClients();
      const installationId = await resolveInstallationId(app, api);
      const number = await resolvePullNumber(app, installationId);
      if (number === undefined) {
        context.skip();
        return;
      }
      const ingested = await new PullRequestIngestor(
        app,
        authorizer,
        new InMemoryPullStore(),
      ).ingest({
        installationId,
        fullName: live?.repo ?? "",
        number,
      });
      expect(ingested.pull.number).toBe(number);
      expect(ingested.pull.fullName.toLowerCase()).toBe(live?.repo.toLowerCase());
      expect(ingested.pull.headSha.length).toBeGreaterThan(0);
    },
  );

  it.skipIf(live === undefined)(
    "publishes a review on the sandbox pull request",
    async (context) => {
      const { app, api, authorizer } = createLiveClients();
      const installationId = await resolveInstallationId(app, api);
      const number = await resolvePullNumber(app, installationId);
      if (number === undefined) {
        context.skip();
        return;
      }
      const ingested = await new PullRequestIngestor(
        app,
        authorizer,
        new InMemoryPullStore(),
      ).ingest({
        installationId,
        fullName: live?.repo ?? "",
        number,
      });
      const published = await new GitHubReviewPublisher(app, authorizer).publish(ingested, {
        diffs: [],
        impact: [],
        findings: [],
        comments: [],
        codeContext: [],
        summary: {
          title: "Codehound live test",
          body: "Codehound live integration test review.",
          event: "COMMENT",
          findingCount: 0,
          counts: emptyCounts(),
        },
      });
      expect(published.event).toBe("COMMENT");
      expect(published.id).toBeGreaterThan(0);
      expect(published.htmlUrl.length).toBeGreaterThan(0);
    },
  );
});
