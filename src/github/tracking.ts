import type { GitHubApp } from "./app.js";
import type { RepositoryAuthorizer } from "./authz.js";
import { systemClock, type Clock } from "./clock.js";
import { GitHubAppError } from "./errors.js";
import { parseRepositoryFullName } from "./types.js";

export const ZERO_SHA = "0".repeat(40);

export type TrackedCommit = {
  sha: string;
  message: string;
  authorName: string;
  authorEmail: string;
  committedAt: string;
  parents: string[];
  htmlUrl: string;
};

export type TrackedBranch = {
  installationId: number;
  fullName: string;
  name: string;
  commitSha: string;
  protected: boolean;
  lastIngestedSha: string | undefined;
  lastSyncedAt: string;
};

export type BranchSyncResult = {
  branch: TrackedBranch;
  previousSha: string | undefined;
  commits: TrackedCommit[];
  changed: boolean;
};

export type RefStore = {
  getBranch: (
    installationId: number,
    fullName: string,
    name: string,
  ) => Promise<TrackedBranch | undefined>;
  listBranches: (installationId: number, fullName: string) => Promise<TrackedBranch[]>;
  upsertBranch: (branch: TrackedBranch) => Promise<TrackedBranch>;
  removeBranch: (installationId: number, fullName: string, name: string) => Promise<boolean>;
  putCommits: (commits: TrackedCommit[]) => Promise<void>;
  getCommit: (sha: string) => Promise<TrackedCommit | undefined>;
};

function branchKey(installationId: number, fullName: string, name: string): string {
  return `${installationId}:${fullName.toLowerCase()}:${name}`;
}

export class InMemoryRefStore implements RefStore {
  private readonly branches = new Map<string, TrackedBranch>();
  private readonly commits = new Map<string, TrackedCommit>();

  async getBranch(
    installationId: number,
    fullName: string,
    name: string,
  ): Promise<TrackedBranch | undefined> {
    return this.branches.get(branchKey(installationId, fullName, name));
  }

  async listBranches(installationId: number, fullName: string): Promise<TrackedBranch[]> {
    return [...this.branches.values()]
      .filter(
        (branch) =>
          branch.installationId === installationId &&
          branch.fullName.toLowerCase() === fullName.toLowerCase(),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async upsertBranch(branch: TrackedBranch): Promise<TrackedBranch> {
    this.branches.set(branchKey(branch.installationId, branch.fullName, branch.name), branch);
    return branch;
  }

  async removeBranch(installationId: number, fullName: string, name: string): Promise<boolean> {
    return this.branches.delete(branchKey(installationId, fullName, name));
  }

  async putCommits(commits: TrackedCommit[]): Promise<void> {
    for (const commit of commits) {
      this.commits.set(commit.sha, commit);
    }
  }

  async getCommit(sha: string): Promise<TrackedCommit | undefined> {
    return this.commits.get(sha);
  }
}

type GitHubBranchPayload = {
  name: string;
  protected: boolean;
  commit: { sha: string };
};

type GitHubCommitPayload = {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author: { name: string; email: string; date: string } | null;
    committer: { name: string; email: string; date: string } | null;
  };
  parents: Array<{ sha: string }>;
};

export type RecordedPush = {
  installationId: number;
  fullName: string;
  branch: string;
  before: string;
  after: string;
  created: boolean;
  deleted: boolean;
  forced: boolean;
  commits: TrackedCommit[];
};

export type BranchTrackerOptions = {
  clock?: Clock;
  pageSize?: number;
};

function parseFullName(fullName: string): { owner: string; name: string; fullName: string } {
  try {
    const parsed = parseRepositoryFullName(fullName);
    return { owner: parsed.owner, name: parsed.name, fullName: `${parsed.owner}/${parsed.name}` };
  } catch {
    throw new GitHubAppError("Repository full name must be owner/name", "MISSING_CONFIG");
  }
}

export function mapGitHubCommit(payload: GitHubCommitPayload): TrackedCommit {
  const identity = payload.commit.committer ?? payload.commit.author;
  return {
    sha: payload.sha,
    message: payload.commit.message,
    authorName: identity?.name ?? "",
    authorEmail: identity?.email ?? "",
    committedAt: identity?.date ?? "",
    parents: payload.parents.map((parent) => parent.sha),
    htmlUrl: payload.html_url,
  };
}

function isZeroSha(sha: string): boolean {
  return sha.replace(/^0+/, "").length === 0 && sha.length > 0;
}

export class BranchTracker {
  private readonly clock: Clock;
  private readonly pageSize: number;

  constructor(
    private readonly app: GitHubApp,
    private readonly authorizer: RepositoryAuthorizer,
    private readonly store: RefStore,
    options: BranchTrackerOptions = {},
  ) {
    this.clock = options.clock ?? systemClock;
    this.pageSize = options.pageSize ?? 100;
  }

  async getBranch(
    installationId: number,
    fullName: string,
    name: string,
  ): Promise<TrackedBranch | undefined> {
    const parsed = parseFullName(fullName);
    return this.store.getBranch(installationId, parsed.fullName, name);
  }

  async listBranches(installationId: number, fullName: string): Promise<TrackedBranch[]> {
    const parsed = parseFullName(fullName);
    return this.store.listBranches(installationId, parsed.fullName);
  }

  async recordIngested(
    installationId: number,
    fullName: string,
    name: string,
    sha: string,
  ): Promise<TrackedBranch> {
    const parsed = parseFullName(fullName);
    const existing = await this.store.getBranch(installationId, parsed.fullName, name);
    const branch: TrackedBranch = {
      installationId,
      fullName: parsed.fullName,
      name,
      commitSha: existing?.commitSha ?? sha,
      protected: existing?.protected ?? false,
      lastIngestedSha: sha,
      lastSyncedAt: this.clock.now().toISOString(),
    };
    return this.store.upsertBranch(branch);
  }

  async applyPush(push: RecordedPush): Promise<BranchSyncResult | undefined> {
    const parsed = parseFullName(push.fullName);
    if (push.deleted || isZeroSha(push.after)) {
      await this.store.removeBranch(push.installationId, parsed.fullName, push.branch);
      return undefined;
    }
    await this.store.putCommits(push.commits);
    const existing = await this.store.getBranch(push.installationId, parsed.fullName, push.branch);
    const branch: TrackedBranch = {
      installationId: push.installationId,
      fullName: parsed.fullName,
      name: push.branch,
      commitSha: push.after,
      protected: existing?.protected ?? false,
      lastIngestedSha: existing?.lastIngestedSha,
      lastSyncedAt: this.clock.now().toISOString(),
    };
    await this.store.upsertBranch(branch);
    return {
      branch,
      previousSha: existing?.commitSha,
      commits: push.commits,
      changed: existing?.commitSha !== push.after,
    };
  }

  async syncRepository(installationId: number, fullName: string): Promise<BranchSyncResult[]> {
    const parsed = parseFullName(fullName);
    await this.authorizer.assertAuthorized({
      installationId,
      owner: parsed.owner,
      repo: parsed.name,
      requiredPermissions: { contents: "read", metadata: "read" },
    });

    const remote = await this.listRemoteBranches(installationId, parsed.owner, parsed.name);
    const known = await this.store.listBranches(installationId, parsed.fullName);
    const remoteNames = new Set(remote.map((branch) => branch.name));
    for (const branch of known) {
      if (!remoteNames.has(branch.name)) {
        await this.store.removeBranch(installationId, parsed.fullName, branch.name);
      }
    }

    const results: BranchSyncResult[] = [];
    for (const payload of remote) {
      results.push(await this.syncListedBranch(installationId, parsed.fullName, payload));
    }
    return results;
  }

  async syncBranch(
    installationId: number,
    fullName: string,
    branchName: string,
  ): Promise<BranchSyncResult> {
    const parsed = parseFullName(fullName);
    await this.authorizer.assertAuthorized({
      installationId,
      owner: parsed.owner,
      repo: parsed.name,
      requiredPermissions: { contents: "read", metadata: "read" },
    });
    const result = await this.app.requestAsInstallation<GitHubBranchPayload>(installationId, {
      method: "GET",
      path: `/repos/${parsed.owner}/${parsed.name}/branches/${encodeURIComponent(branchName)}`,
    });
    return this.syncListedBranch(installationId, parsed.fullName, result.data);
  }

  private async syncListedBranch(
    installationId: number,
    fullName: string,
    payload: GitHubBranchPayload,
  ): Promise<BranchSyncResult> {
    const existing = await this.store.getBranch(installationId, fullName, payload.name);
    const previousSha = existing?.commitSha;
    const changed = previousSha !== payload.commit.sha;
    const commits = changed
      ? await this.listNewCommits(installationId, fullName, payload.name, previousSha)
      : [];
    if (commits.length > 0) {
      await this.store.putCommits(commits);
    }
    const branch: TrackedBranch = {
      installationId,
      fullName,
      name: payload.name,
      commitSha: payload.commit.sha,
      protected: payload.protected,
      lastIngestedSha: existing?.lastIngestedSha,
      lastSyncedAt: this.clock.now().toISOString(),
    };
    await this.store.upsertBranch(branch);
    return { branch, previousSha, commits, changed };
  }

  private async listRemoteBranches(
    installationId: number,
    owner: string,
    name: string,
  ): Promise<GitHubBranchPayload[]> {
    const branches: GitHubBranchPayload[] = [];
    for (let page = 1; page <= 100; page += 1) {
      const result = await this.app.requestAsInstallation<GitHubBranchPayload[]>(installationId, {
        method: "GET",
        path: `/repos/${owner}/${name}/branches`,
        query: { per_page: this.pageSize, page },
      });
      const batch = result.data ?? [];
      branches.push(...batch);
      if (batch.length === 0 || batch.length < this.pageSize) {
        break;
      }
    }
    return branches;
  }

  private async listNewCommits(
    installationId: number,
    fullName: string,
    branchName: string,
    stopSha: string | undefined,
  ): Promise<TrackedCommit[]> {
    const { owner, name } = parseRepositoryFullName(fullName);
    const collected: TrackedCommit[] = [];
    for (let page = 1; page <= 20; page += 1) {
      const result = await this.app.requestAsInstallation<GitHubCommitPayload[]>(installationId, {
        method: "GET",
        path: `/repos/${owner}/${name}/commits`,
        query: { sha: branchName, per_page: this.pageSize, page },
      });
      const batch = result.data ?? [];
      let reachedStop = false;
      for (const payload of batch) {
        if (stopSha !== undefined && payload.sha === stopSha) {
          reachedStop = true;
          break;
        }
        collected.push(mapGitHubCommit(payload));
      }
      if (reachedStop || batch.length === 0 || batch.length < this.pageSize) {
        break;
      }
    }
    return collected;
  }
}
