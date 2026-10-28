import type { CodeIntelligenceModel } from "./model.js";
import type { CimSnapshot } from "./types.js";

export type CimStore = {
  save: (snapshot: CimSnapshot) => Promise<CimSnapshot>;
  get: (fullName: string, commitSha: string) => Promise<CimSnapshot | undefined>;
  list: (fullName: string) => Promise<CimSnapshot[]>;
  getLatest: (fullName: string) => Promise<CimSnapshot | undefined>;
};

export class InMemoryCimStore implements CimStore {
  private readonly items: CimSnapshot[] = [];

  async save(snapshot: CimSnapshot): Promise<CimSnapshot> {
    this.items.push(snapshot);
    return snapshot;
  }

  async get(fullName: string, commitSha: string): Promise<CimSnapshot | undefined> {
    const normalized = fullName.toLowerCase();
    return this.items
      .filter(
        (item) =>
          item.repositoryFullName.toLowerCase() === normalized && item.commitSha === commitSha,
      )
      .sort((left, right) => right.version - left.version)[0];
  }

  async list(fullName: string): Promise<CimSnapshot[]> {
    const normalized = fullName.toLowerCase();
    return this.items
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
