import { GitHubApi } from "./api.js";
import { systemClock, type Clock } from "./clock.js";
import { loadGitHubAppConfig, type EnvMap } from "./config.js";
import { GitHubAppError } from "./errors.js";
import { createFetchHttpClient, type HttpClient } from "./http.js";
import { createGitHubAppJwt, type GitHubAppJwt } from "./jwt.js";
import { InstallationTokenClient, type TokenMintOptions } from "./tokens.js";
import type {
  GitHubAppCredentials,
  Installation,
  InstallationToken,
  PermissionLevel,
} from "./types.js";

type InstallationResponse = {
  id: number;
  account: { id: number; login: string; type: string };
  app_id: number;
  target_type: string;
  repository_selection: "all" | "selected";
  permissions: Record<string, PermissionLevel>;
  suspended_at: string | null;
};

export type GitHubAppOptions = {
  http?: HttpClient;
  clock?: Clock;
  refreshSkewSeconds?: number;
};

export class GitHubApp {
  readonly credentials: GitHubAppCredentials;
  readonly tokens: InstallationTokenClient;
  private readonly api: GitHubApi;
  private readonly clock: Clock;

  constructor(credentials: GitHubAppCredentials, options: GitHubAppOptions = {}) {
    this.credentials = credentials;
    this.clock = options.clock ?? systemClock;
    const http = options.http ?? createFetchHttpClient();
    this.api = new GitHubApi(credentials, http);
    this.tokens = new InstallationTokenClient(credentials, http, {
      clock: this.clock,
      ...(options.refreshSkewSeconds !== undefined
        ? { refreshSkewSeconds: options.refreshSkewSeconds }
        : {}),
    });
  }

  static fromEnv(env: EnvMap = process.env, options: GitHubAppOptions = {}): GitHubApp {
    return new GitHubApp(loadGitHubAppConfig(env), options);
  }

  createAppJwt(lifetimeSeconds?: number): Promise<GitHubAppJwt> {
    return createGitHubAppJwt(this.credentials, {
      clock: this.clock,
      ...(lifetimeSeconds !== undefined ? { lifetimeSeconds } : {}),
    });
  }

  getInstallationToken(
    installationId: number,
    options: TokenMintOptions = {},
  ): Promise<InstallationToken> {
    return this.tokens.getToken(installationId, options);
  }

  async getInstallation(installationId: number): Promise<Installation> {
    const jwt = await this.createAppJwt();
    let data: InstallationResponse;
    try {
      const result = await this.api.request<InstallationResponse>({
        method: "GET",
        path: `/app/installations/${installationId}`,
        token: jwt.token,
      });
      data = result.data;
    } catch (error) {
      if (error instanceof GitHubAppError && error.status === 404) {
        throw new GitHubAppError(
          `GitHub App installation ${installationId} was not found`,
          "INSTALLATION_NOT_FOUND",
          404,
        );
      }
      throw error;
    }

    const installation: Installation = {
      id: data.id,
      account: data.account,
      appId: data.app_id,
      targetType: data.target_type,
      repositorySelection: data.repository_selection,
      permissions: data.permissions ?? {},
      suspendedAt: data.suspended_at ?? undefined,
    };

    if (installation.suspendedAt !== undefined) {
      throw new GitHubAppError(
        `GitHub App installation ${installationId} is suspended`,
        "INSTALLATION_SUSPENDED",
        403,
      );
    }

    return installation;
  }

  async requestAsInstallation<T>(
    installationId: number,
    req: {
      method: string;
      path: string;
      body?: unknown;
      query?: Record<string, string | number | boolean | undefined>;
    },
  ) {
    const token = await this.getInstallationToken(installationId);
    return this.api.request<T>({
      method: req.method,
      path: req.path,
      token: token.token,
      ...(req.body !== undefined ? { body: req.body } : {}),
      ...(req.query !== undefined ? { query: req.query } : {}),
    });
  }
}
