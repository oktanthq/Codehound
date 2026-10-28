import type { AnalysisRun } from "./types.js";

export type StoredAnalysis = {
  repositoryFullName: string;
  commitSha: string;
  ref: string;
  analyzedAt: string;
  documentCount: number;
  skippedCount: number;
  run: AnalysisRun;
};

export type AnalysisStore = {
  save: (run: AnalysisRun, analyzedAt: string) => Promise<StoredAnalysis>;
  get: (fullName: string, commitSha: string) => Promise<StoredAnalysis | undefined>;
  list: (fullName: string) => Promise<StoredAnalysis[]>;
  getLatest: (fullName: string) => Promise<StoredAnalysis | undefined>;
};

function analysisKey(fullName: string, commitSha: string): string {
  return `${fullName.toLowerCase()}:${commitSha.toLowerCase()}`;
}

export class InMemoryAnalysisStore implements AnalysisStore {
  private readonly items = new Map<string, StoredAnalysis>();

  async save(run: AnalysisRun, analyzedAt: string): Promise<StoredAnalysis> {
    const stored: StoredAnalysis = {
      repositoryFullName: run.context.repositoryFullName,
      commitSha: run.context.commitSha,
      ref: run.context.ref,
      analyzedAt,
      documentCount: run.documents.length,
      skippedCount: run.skipped.length,
      run,
    };
    this.items.set(analysisKey(stored.repositoryFullName, stored.commitSha), stored);
    return stored;
  }

  async get(fullName: string, commitSha: string): Promise<StoredAnalysis | undefined> {
    return this.items.get(analysisKey(fullName, commitSha));
  }

  async list(fullName: string): Promise<StoredAnalysis[]> {
    const normalized = fullName.toLowerCase();
    return [...this.items.values()]
      .filter((item) => item.repositoryFullName.toLowerCase() === normalized)
      .sort((a, b) => {
        if (a.analyzedAt !== b.analyzedAt) {
          return a.analyzedAt < b.analyzedAt ? 1 : -1;
        }
        return a.commitSha.localeCompare(b.commitSha);
      });
  }

  async getLatest(fullName: string): Promise<StoredAnalysis | undefined> {
    const versions = await this.list(fullName);
    return versions[0];
  }
}
