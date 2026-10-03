import { access, constants } from "node:fs/promises";
import { join } from "node:path";
import type { GitHubApp } from "./app.js";
import type { RepositoryAuthorizer } from "./authz.js";
import { systemClock, type Clock } from "./clock.js";
import { GitHubAppError } from "./errors.js";
import {
  authenticatedCloneUrl,
  isFetchingGitCli,
  ProcessGitCli,
  type FetchingGitCli,
  type GitCli,
} from "./git.js";
import {
  defaultIngestRoot,
  RepositoryIngestor,
  type IngestRequest,
  type IngestSnapshot,
  type RepositoryIngestorOptions,
} from "./ingest.js";
import type { BranchTracker } from "./tracking.js";
import { parseRepositoryFullName } from "./types.js";
import { listIngestedFiles } from "./walk.js";
import { applyWebhookToTracker, type ParsedWebhook } from "./webhooks.js";

export type IncrementalAction = "skipped" | "incremental" | "full";

export type IncrementalIngestResult = {
  action: IncrementalAction;
  reason: string;
  snapshot: IngestSnapshot;
  changedFiles: string[];
  previousSha: string | undefined;
};

export type WebhookIngestResult =
  | IncrementalIngestResult
  | { action: "ignored"; event: ParsedWebhook }
  | { action: "deleted"; fullName: string; branch: string };

export type IncrementalIngestorOptions = RepositoryIngestorOptions & {
  tracker: BranchTracker;
};

async function hasWorktree(path: string): Promise<boolean> {
  try {
    await access(join(path, ".git"), constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function resolveNames(request: IngestRequest): { owner: string; name: string; fullName: string } {
  if (request.fullName !== undefined) {
    try {
      const parsed = parseRepositoryFullName(request.fullName);
      return { owner: parsed.owner, name: parsed.name, fullName: `${parsed.owner}/${parsed.name}` };
    } catch {
      throw new GitHubAppError("Repository full name must be owner/name", "MISSING_CONFIG");
    }
  }
  if (request.owner === undefined || request.repo === undefined) {
    throw new GitHubAppError("Repository owner and name are required", "MISSING_CONFIG");
  }
  return {
    owner: request.owner,
    name: request.repo,
    fullName: `${request.owner}/${request.repo}`,
  };
}

export class IncrementalIngestor {
  private readonly git: GitCli;
  private readonly clock: Clock;
  private readonly rootDir: string;
  private readonly requireSelected: boolean;
  private readonly ingestor: RepositoryIngestor;
  private readonly tracker: BranchTracker;

  constructor(
    private readonly app: GitHubApp,
    private readonly authorizer: RepositoryAuthorizer,
    options: IncrementalIngestorOptions,
  ) {
    this.tracker = options.tracker;
    this.git = options.git ?? new ProcessGitCli();
    this.clock = options.clock ?? systemClock;
    this.rootDir = options.rootDir ?? defaultIngestRoot();
    this.requireSelected = options.requireSelected ?? true;
    this.ingestor = new RepositoryIngestor(app, authorizer, {
      rootDir: this.rootDir,
      git: this.git,
      clock: this.clock,
      requireSelected: this.requireSelected,
    });
  }

  async ingest(
    request: IngestRequest & { targetSha?: string; forced?: boolean },
  ): Promise<IncrementalIngestResult> {
    const { owner, name, fullName } = resolveNames(request);
    const access = await this.authorizer.assertAuthorized({
      installationId: request.installationId,
      owner,
      repo: name,
      requiredPermissions: { contents: "read", metadata: "read" },
      requireSelected: this.requireSelected,
    });
    const ref = request.ref ?? access.repository.defaultBranch;
    const tracked = await this.tracker.getBranch(request.installationId, fullName, ref);
    let targetSha = request.targetSha;
    let previousSha = tracked?.lastIngestedSha;
    if (targetSha === undefined) {
      const synced = await this.tracker.syncBranch(request.installationId, fullName, ref);
      targetSha = synced.branch.commitSha;
      previousSha = synced.branch.lastIngestedSha;
    }
    const destination = join(this.rootDir, String(request.installationId), owner, name);

    if (previousSha === targetSha && (await hasWorktree(destination))) {
      const snapshot = await this.snapshotFromWorktree({
        request,
        accessRepository: access.repository,
        ref,
        destination,
        commitSha: targetSha,
      });
      return {
        action: "skipped",
        reason: "worktree already at tracked commit",
        snapshot,
        changedFiles: [],
        previousSha,
      };
    }

    if (
      request.forced !== true &&
      previousSha !== undefined &&
      (await hasWorktree(destination)) &&
      isFetchingGitCli(this.git)
    ) {
      const incremental = await this.tryIncremental({
        git: this.git,
        request,
        fullName,
        ref,
        destination,
        cloneUrl: access.repository.cloneUrl,
        previousSha,
        accessRepository: access.repository,
      });
      if (incremental !== undefined) {
        return incremental;
      }
    }

    const snapshot = await this.ingestor.ingest(request);
    await this.tracker.recordIngested(
      request.installationId,
      fullName,
      snapshot.ref,
      snapshot.commitSha,
    );
    return {
      action: "full",
      reason: previousSha === undefined ? "no previous ingest" : "fell back to full clone",
      snapshot,
      changedFiles: snapshot.files.map((file) => file.path),
      previousSha,
    };
  }

  async ingestFromWebhook(event: ParsedWebhook): Promise<WebhookIngestResult> {
    if (event.type === "push") {
      await applyWebhookToTracker(this.tracker, event);
      if (event.deleted || event.branch === undefined) {
        return { action: "deleted", fullName: event.fullName, branch: event.branch ?? event.ref };
      }
      const ingestRequest: IngestRequest & { targetSha?: string; forced?: boolean } = {
        installationId: event.installationId,
        fullName: event.fullName,
        ref: event.branch,
        targetSha: event.after,
      };
      if (event.forced) {
        ingestRequest.forced = true;
      }
      return this.ingest(ingestRequest);
    }
    if (event.type === "delete") {
      await applyWebhookToTracker(this.tracker, event);
      return { action: "deleted", fullName: event.fullName, branch: event.ref };
    }
    return { action: "ignored", event };
  }

  private async tryIncremental(input: {
    git: FetchingGitCli;
    request: IngestRequest;
    fullName: string;
    ref: string;
    destination: string;
    cloneUrl: string;
    previousSha: string;
    accessRepository: IngestSnapshot["repository"];
  }): Promise<IncrementalIngestResult | undefined> {
    const token = await this.app.getInstallationToken(input.request.installationId);
    const cloneUrl = authenticatedCloneUrl(input.cloneUrl, token.token);
    try {
      await input.git.setRemoteUrl(input.destination, cloneUrl);
      const fetchRequest: Parameters<FetchingGitCli["fetch"]>[0] = {
        repoPath: input.destination,
        remote: "origin",
        ref: input.ref,
        secrets: [token.token, cloneUrl],
      };
      await input.git.fetch(fetchRequest);
      const fetchedSha = await input.git.revParse(input.destination, "FETCH_HEAD");
      const mergeBase = await input.git.mergeBase(input.destination, input.previousSha, fetchedSha);
      if (mergeBase !== input.previousSha) {
        return undefined;
      }
      await input.git.resetHard(input.destination, fetchedSha);
      const changedFiles = await input.git.diffNames(
        input.destination,
        input.previousSha,
        fetchedSha,
      );
      const snapshot = await this.snapshotFromWorktree({
        request: input.request,
        accessRepository: input.accessRepository,
        ref: input.ref,
        destination: input.destination,
        commitSha: fetchedSha,
      });
      await this.tracker.recordIngested(
        input.request.installationId,
        input.fullName,
        input.ref,
        fetchedSha,
      );
      return {
        action: "incremental",
        reason: "fast-forward from last ingested commit",
        snapshot,
        changedFiles,
        previousSha: input.previousSha,
      };
    } catch {
      return undefined;
    }
  }

  private async snapshotFromWorktree(input: {
    request: IngestRequest;
    accessRepository: IngestSnapshot["repository"];
    ref: string;
    destination: string;
    commitSha: string;
  }): Promise<IngestSnapshot> {
    const files = await listIngestedFiles(input.destination);
    return {
      installationId: input.request.installationId,
      repository: input.accessRepository,
      ref: input.ref,
      commitSha: input.commitSha,
      ingestedAt: this.clock.now().toISOString(),
      worktreePath: input.destination,
      fileCount: files.length,
      byteSize: files.reduce((sum, file) => sum + file.size, 0),
      files,
    };
  }
}
