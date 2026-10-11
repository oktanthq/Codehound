import type { CodeIntelligenceModel } from "./model.js";
import type { CimSnapshot } from "./types.js";

export type CimStore = {
  save: (snapshot: CimSnapshot) => Promise<CimSnapshot>;
  get: (fullName: string, commitSha: string) => Promise<CimSnapshot | undefined>;
  list: (fullName: string) => Promise<CimSnapshot[]>;
  getLatest: (fullName: string) => Promise<CimSnapshot | undefined>;
};

function snapshotKey(fullName: string, commitSha: string): string {
  return `${fullName.toLowerCase()}:${commitSha}`;
}

export class InMemoryCimStore implements CimStore {
  private readonly items = new Map<string, CimSnapshot>();

  async save(snapshot: CimSnapshot): Promise<CimSnapshot> {
    this.items.set(snapshotKey(snapshot.repositoryFullName, snapshot.commitSha), snapshot);
    return snapshot;
  }

  async get(fullName: string, commitSha: string): Promise<CimSnapshot | undefined> {
    return this.items.get(snapshotKey(fullName, commitSha));
  }

  async list(fullName: string): Promise<CimSnapshot[]> {
    const normalized = fullName.toLowerCase();
    return [...this.items.values()]
      .filter((item) => item.repositoryFullName.toLowerCase() === normalized)
      .sort((left, right) => right.version - left.version);
  }

  async getLatest(fullName: string): Promise<CimSnapshot | undefined> {
    return (await this.list(fullName))[0];
  }
}

export async function persistModel(
  store: CimStore,
  model: CodeIntelligenceModel,
  repositoryFullName: string,
  commitSha: string,
  createdAt: string,
): Promise<CimSnapshot> {
  return store.save(model.snapshot(repositoryFullName, commitSha, createdAt));
}
