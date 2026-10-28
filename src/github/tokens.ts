import { GitHubApi } from "./api.js";
import { systemClock, type Clock } from "./clock.js";
import { GitHubAppError } from "./errors.js";
import type { HttpClient } from "./http.js";
import { createGitHubAppJwt } from "./jwt.js";
import type { GitHubAppCredentials, InstallationToken, PermissionLevel } from "./types.js";

export type TokenMintOptions = {
  repositories?: string[];
  permissions?: Record<string, PermissionLevel>;
  forceRefresh?: boolean;
};

type TokenResponse = {
  token: string;
  expires_at: string;
  permissions?: Record<string, PermissionLevel>;
  repository_selection?: "all" | "selected";
};

function cacheKey(installationId: number, options: TokenMintOptions): string {
  const repos = [...(options.repositories ?? [])].sort().join(",");
  const permissions = Object.entries(options.permissions ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, level]) => `${name}:${level}`)
    .join(",");
  return `${installationId}|${repos}|${permissions}`;
}

export class InstallationTokenClient {
  private readonly cache = new Map<string, InstallationToken>();
  private readonly api: GitHubApi;
  private readonly clock: Clock;
  private readonly refreshSkewSeconds: number;

  constructor(
    private readonly credentials: GitHubAppCredentials,
    http: HttpClient,
    options: { clock?: Clock; refreshSkewSeconds?: number } = {},
  ) {
    this.api = new GitHubApi(credentials, http);
    this.clock = options.clock ?? systemClock;
    this.refreshSkewSeconds = options.refreshSkewSeconds ?? 60;
  }

  invalidate(installationId?: number): void {
    if (installationId === undefined) {
      this.cache.clear();
      return;
    }
    const prefix = `${installationId}|`;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  async getToken(
    installationId: number,
    options: TokenMintOptions = {},
  ): Promise<InstallationToken> {
    if (!Number.isInteger(installationId) || installationId <= 0) {
      throw new GitHubAppError("installationId must be a positive integer", "MISSING_CONFIG");
    }

    const key = cacheKey(installationId, options);
    const cached = this.cache.get(key);
    if (cached !== undefined && options.forceRefresh !== true && !this.isExpiring(cached)) {
      return cached;
    }

    const jwt = await createGitHubAppJwt(this.credentials, { clock: this.clock });
    const body: Record<string, unknown> = {};
    if (options.repositories !== undefined && options.repositories.length > 0) {
      body.repositories = options.repositories;
    }
    if (options.permissions !== undefined && Object.keys(options.permissions).length > 0) {
      body.permissions = options.permissions;
    }

    const request = {
      method: "POST",
      path: `/app/installations/${installationId}/access_tokens`,
      token: jwt.token,
      ...(Object.keys(body).length > 0 ? { body } : {}),
    };

    let response: TokenResponse;
    try {
      const result = await this.api.request<TokenResponse>(request);
      response = result.data;
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

    const token: InstallationToken = {
      token: response.token,
      expiresAt: new Date(response.expires_at),
      installationId,
      permissions: response.permissions ?? {},
      repositorySelection: response.repository_selection ?? "selected",
    };
    this.cache.set(key, token);
    return token;
  }

  private isExpiring(token: InstallationToken): boolean {
    const expiresAtSeconds = Math.floor(token.expiresAt.getTime() / 1000);
    return expiresAtSeconds - this.refreshSkewSeconds <= this.clock.nowSeconds();
  }
}
