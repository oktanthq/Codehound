import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { GitHubApp } from "./app.js";
import type { RepositoryAuthorizer } from "./authz.js";
import { systemClock, type Clock } from "./clock.js";
import { GitHubAppError, redactSecrets } from "./errors.js";
import { authenticatedCloneUrl, ProcessGitCli, type GitCli } from "./git.js";
import { parseRepositoryFullName, type RepositoryRef } from "./types.js";
import { fileInventory, type LanguageStat } from "./languages.js";
import type { MetadataStore } from "./metadata.js";
import { listIngestedFiles, type IngestedFile } from "./walk.js";

export type IngestRequest = {
  installationId: number;
  owner?: string;
  repo?: string;
  fullName?: string;
  ref?: string;
  depth?: number;
};

export type IngestSnapshot = {
  installationId: number;
  repository: RepositoryRef;
  ref: string;
  commitSha: string;
  ingestedAt: string;
  worktreePath: string;
  fileCount: number;
  byteSize: number;
  languages: LanguageStat[];
  primaryLanguage: string | undefined;
  files: IngestedFile[];
};

export type RepositoryIngestorOptions = {
  rootDir?: string;
  git?: GitCli;
  clock?: Clock;
  requireSelected?: boolean;
  metadata?: MetadataStore;
};

function resolveNames(request: IngestRequest): { owner: string; name: string } {
  if (request.fullName !== undefined) {
    try {
      return parseRepositoryFullName(request.fullName);
    } catch {
      throw new GitHubAppError("Repository full name must be owner/name", "MISSING_CONFIG");
    }
  }
  if (request.owner === undefined || request.repo === undefined) {
    throw new GitHubAppError("Repository owner and name are required", "MISSING_CONFIG");
  }
  return { owner: request.owner, name: request.repo };
}

export function defaultIngestRoot(env: Record<string, string | undefined> = process.env): string {
  return env.CODEHOUND_INGEST_ROOT?.trim() || join(tmpdir(), "codehound-ingest");
}

export class RepositoryIngestor {
  private readonly git: GitCli;
  private readonly clock: Clock;
  private readonly rootDir: string;
  private readonly requireSelected: boolean;
  private readonly metadata: MetadataStore | undefined;

  constructor(
    private readonly app: GitHubApp,
    private readonly authorizer: RepositoryAuthorizer,
    options: RepositoryIngestorOptions = {},
  ) {
    this.git = options.git ?? new ProcessGitCli();
    this.clock = options.clock ?? systemClock;
    this.rootDir = options.rootDir ?? defaultIngestRoot();
    this.requireSelected = options.requireSelected ?? true;
    this.metadata = options.metadata;
  }

  async ingest(request: IngestRequest): Promise<IngestSnapshot> {
    const { owner, name } = resolveNames(request);
    const access = await this.authorizer.assertAuthorized({
      installationId: request.installationId,
      owner,
      repo: name,
      requiredPermissions: { contents: "read", metadata: "read" },
      requireSelected: this.requireSelected,
    });

    const token = await this.app.getInstallationToken(request.installationId);
    const ref = request.ref ?? access.repository.defaultBranch;
    const destination = join(this.rootDir, String(request.installationId), owner, name);
    const cloneUrl = authenticatedCloneUrl(access.repository.cloneUrl, token.token);
    const secrets = [token.token, cloneUrl];

    await rm(destination, { recursive: true, force: true });
    await mkdir(join(destination, ".."), { recursive: true });

    try {
      const cloneRequest: Parameters<GitCli["clone"]>[0] = {
        url: cloneUrl,
        destination,
        secrets,
        depth: request.depth ?? 1,
      };
      if (ref.length > 0) {
        cloneRequest.ref = ref;
      }
      await this.git.clone(cloneRequest);
    } catch (error) {
      const message = error instanceof Error ? error.message : "git clone failed";
      throw new GitHubAppError(redactSecrets(message, secrets), "CLONE_FAILED");
    }

    try {
      const commitSha = await this.git.revParse(destination, "HEAD");
      const files = await listIngestedFiles(destination);
      const inventory = fileInventory(files);
      const snapshot: IngestSnapshot = {
        installationId: request.installationId,
        repository: access.repository,
        ref,
        commitSha,
        ingestedAt: this.clock.now().toISOString(),
        worktreePath: destination,
        fileCount: inventory.fileCount,
        byteSize: inventory.byteSize,
        languages: inventory.languages,
        primaryLanguage: inventory.primaryLanguage,
        files,
      };
      if (this.metadata !== undefined) {
        await this.metadata.saveIngest(snapshot);
      }
      return snapshot;
    } catch (error) {
      const message = error instanceof Error ? error.message : "ingest failed";
      throw new GitHubAppError(redactSecrets(message, secrets), "INGEST_FAILED");
    }
  }
}
