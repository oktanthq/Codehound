import type { GitHubApp } from "../github/app.js";
import type { RepositoryAuthorizer } from "../github/authz.js";
import { parseRepositoryFullName } from "../github/types.js";
import type { ParsedPullRequest } from "../github/webhooks.js";
import { systemClock, type Clock } from "../github/clock.js";
import type { PullStore } from "./store.js";
import type { IngestedPull, PullCommit, PullFile, PullRef } from "./types.js";

export type PullIngestRequest = {
  installationId: number;
  fullName: string;
  number: number;
};

type GitHubPullPayload = {
  number: number;
  title?: string;
  body?: string | null;
  state?: string;
  draft?: boolean;
  html_url?: string;
  updated_at?: string;
  user?: { login?: string };
  base?: { ref?: string; sha?: string; repo?: { full_name?: string } };
  head?: { ref?: string; sha?: string };
};

type GitHubPullFilePayload = {
  filename?: string;
  status?: string;
  previous_filename?: string;
  additions?: number;
  deletions?: number;
  patch?: string;
};

type GitHubPullCommitPayload = {
  sha?: string;
  commit?: { message?: string; author?: { name?: string } };
};

function readString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function mapPullPayload(payload: GitHubPullPayload, fallbackFullName: string): PullRef {
  return {
    number: payload.number,
    title: readString(payload.title),
    body: readString(payload.body ?? ""),
    state: readString(payload.state, "open"),
    draft: payload.draft === true,
    htmlUrl: readString(payload.html_url),
    fullName: readString(payload.base?.repo?.full_name, fallbackFullName),
    baseRef: readString(payload.base?.ref),
    baseSha: readString(payload.base?.sha),
    headRef: readString(payload.head?.ref),
    headSha: readString(payload.head?.sha),
    author: readString(payload.user?.login),
    updatedAt: readString(payload.updated_at),
  };
}

export function mapPullFile(payload: GitHubPullFilePayload): PullFile | undefined {
  const path = readString(payload.filename);
  if (path.length === 0) {
    return undefined;
  }
  return {
    path,
    status: readString(payload.status, "modified"),
    previousPath:
      typeof payload.previous_filename === "string" ? payload.previous_filename : undefined,
    additions: payload.additions ?? 0,
    deletions: payload.deletions ?? 0,
    patch: typeof payload.patch === "string" ? payload.patch : undefined,
  };
}

export function mapPullCommit(payload: GitHubPullCommitPayload): PullCommit | undefined {
  const sha = readString(payload.sha);
  if (sha.length === 0) {
    return undefined;
  }
  return {
    sha,
    message: readString(payload.commit?.message),
    authorName: readString(payload.commit?.author?.name),
  };
}

export class PullRequestIngestor {
  private readonly clock: Clock;

  constructor(
    private readonly app: GitHubApp,
    private readonly authorizer: RepositoryAuthorizer,
    private readonly store: PullStore,
    options: { clock?: Clock } = {},
  ) {
    this.clock = options.clock ?? systemClock;
  }

  async ingest(request: PullIngestRequest): Promise<IngestedPull> {
    const { owner, name } = parseRepositoryFullName(request.fullName);
    await this.authorizer.assertAuthorized({
      installationId: request.installationId,
      owner,
      repo: name,
      requiredPermissions: { pull_requests: "read", metadata: "read" },
    });
    const pullResult = await this.app.requestAsInstallation<GitHubPullPayload>(
      request.installationId,
      {
        method: "GET",
        path: `/repos/${owner}/${name}/pulls/${request.number}`,
      },
    );
    const filesResult = await this.app.requestAsInstallation<GitHubPullFilePayload[]>(
      request.installationId,
      {
        method: "GET",
        path: `/repos/${owner}/${name}/pulls/${request.number}/files`,
        query: { per_page: 100 },
      },
    );
    const commitsResult = await this.app.requestAsInstallation<GitHubPullCommitPayload[]>(
      request.installationId,
      {
        method: "GET",
        path: `/repos/${owner}/${name}/pulls/${request.number}/commits`,
        query: { per_page: 100 },
      },
    );
    const ingested: IngestedPull = {
      installationId: request.installationId,
      pull: mapPullPayload(pullResult.data, request.fullName),
      files: (filesResult.data ?? []).flatMap((file) => {
        const mapped = mapPullFile(file);
        return mapped === undefined ? [] : [mapped];
      }),
      commits: (commitsResult.data ?? []).flatMap((commit) => {
        const mapped = mapPullCommit(commit);
        return mapped === undefined ? [] : [mapped];
      }),
      ingestedAt: this.clock.now().toISOString(),
    };
    return this.store.save(ingested);
  }

  async syncWebhook(event: ParsedPullRequest): Promise<IngestedPull | undefined> {
    if (event.number < 1) {
      return undefined;
    }
    return this.ingest({
      installationId: event.installationId,
      fullName: event.fullName,
      number: event.number,
    });
  }
}
