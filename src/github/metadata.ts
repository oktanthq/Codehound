import type { LanguageStat } from "./languages.js";
import { parseRepositoryFullName, type RepositoryRef } from "./types.js";
import type { IngestedFile } from "./walk.js";

export type IngestRecord = {
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

export type StoredRepository = {
  installationId: number;
  repository: RepositoryRef;
  primaryLanguage: string | undefined;
  languages: LanguageStat[];
  lastIngestedSha: string | undefined;
  lastIngestedAt: string | undefined;
  lastRef: string | undefined;
  fileCount: number;
  byteSize: number;
  updatedAt: string;
};

export type StoredVersion = {
  installationId: number;
  fullName: string;
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

export type MetadataStore = {
  saveIngest: (
    snapshot: IngestRecord,
  ) => Promise<{ repository: StoredRepository; version: StoredVersion }>;
  getRepository: (
    installationId: number,
    fullName: string,
  ) => Promise<StoredRepository | undefined>;
  listRepositories: (installationId: number) => Promise<StoredRepository[]>;
  getVersion: (
    installationId: number,
    fullName: string,
    commitSha: string,
  ) => Promise<StoredVersion | undefined>;
  listVersions: (installationId: number, fullName: string) => Promise<StoredVersion[]>;
  getLatestVersion: (
    installationId: number,
    fullName: string,
  ) => Promise<StoredVersion | undefined>;
};

function repositoryKey(installationId: number, fullName: string): string {
  return `${installationId}:${fullName.toLowerCase()}`;
}

function versionKey(installationId: number, fullName: string, commitSha: string): string {
  return `${installationId}:${fullName.toLowerCase()}:${commitSha.toLowerCase()}`;
}

export function snapshotToVersion(snapshot: IngestRecord): StoredVersion {
  return {
    installationId: snapshot.installationId,
    fullName: snapshot.repository.fullName,
    ref: snapshot.ref,
    commitSha: snapshot.commitSha,
    ingestedAt: snapshot.ingestedAt,
    worktreePath: snapshot.worktreePath,
    fileCount: snapshot.fileCount,
    byteSize: snapshot.byteSize,
    languages: snapshot.languages,
    primaryLanguage: snapshot.primaryLanguage,
    files: snapshot.files,
  };
}

export function snapshotToRepository(snapshot: IngestRecord): StoredRepository {
  return {
    installationId: snapshot.installationId,
    repository: snapshot.repository,
    primaryLanguage: snapshot.primaryLanguage,
    languages: snapshot.languages,
    lastIngestedSha: snapshot.commitSha,
    lastIngestedAt: snapshot.ingestedAt,
    lastRef: snapshot.ref,
    fileCount: snapshot.fileCount,
    byteSize: snapshot.byteSize,
    updatedAt: snapshot.ingestedAt,
  };
}

export class InMemoryMetadataStore implements MetadataStore {
  private readonly repositories = new Map<string, StoredRepository>();
  private readonly versions = new Map<string, StoredVersion>();

  async saveIngest(
    snapshot: IngestRecord,
  ): Promise<{ repository: StoredRepository; version: StoredVersion }> {
    const { owner, name } = parseRepositoryFullName(snapshot.repository.fullName);
    const version = snapshotToVersion({
      ...snapshot,
      repository: { ...snapshot.repository, owner, name, fullName: `${owner}/${name}` },
    });
    const repository = snapshotToRepository({
      ...snapshot,
      repository: { ...snapshot.repository, owner, name, fullName: `${owner}/${name}` },
    });
    this.versions.set(
      versionKey(version.installationId, version.fullName, version.commitSha),
      version,
    );
    this.repositories.set(repositoryKey(repository.installationId, version.fullName), repository);
    return { repository, version };
  }

  async getRepository(
    installationId: number,
    fullName: string,
  ): Promise<StoredRepository | undefined> {
    return this.repositories.get(repositoryKey(installationId, fullName));
  }

  async listRepositories(installationId: number): Promise<StoredRepository[]> {
    return [...this.repositories.values()]
      .filter((item) => item.installationId === installationId)
      .sort((a, b) => a.repository.fullName.localeCompare(b.repository.fullName));
  }

  async getVersion(
    installationId: number,
    fullName: string,
    commitSha: string,
  ): Promise<StoredVersion | undefined> {
    return this.versions.get(versionKey(installationId, fullName, commitSha));
  }

  async listVersions(installationId: number, fullName: string): Promise<StoredVersion[]> {
    const normalized = fullName.toLowerCase();
    return [...this.versions.values()]
      .filter(
        (item) =>
          item.installationId === installationId && item.fullName.toLowerCase() === normalized,
      )
      .sort((a, b) => {
        if (a.ingestedAt !== b.ingestedAt) {
          return a.ingestedAt < b.ingestedAt ? 1 : -1;
        }
        return a.commitSha.localeCompare(b.commitSha);
      });
  }

  async getLatestVersion(
    installationId: number,
    fullName: string,
  ): Promise<StoredVersion | undefined> {
    const versions = await this.listVersions(installationId, fullName);
    return versions[0];
  }
}
