import type { CodeIntelligenceModel } from "./model.js";
import type { CimStore } from "./store.js";
import type { CimSnapshot } from "./types.js";

export async function persistNewVersion(
  store: CimStore,
  model: CodeIntelligenceModel,
  repositoryFullName: string,
  commitSha: string,
  createdAt: string,
): Promise<CimSnapshot> {
  model.bumpVersion();
  return store.save(model.snapshot(repositoryFullName, commitSha, createdAt));
}

export async function listVersions(store: CimStore, fullName: string): Promise<number[]> {
  return (await store.list(fullName)).map((snapshot) => snapshot.version);
}

export async function getVersion(
  store: CimStore,
  fullName: string,
  version: number,
): Promise<CimSnapshot | undefined> {
  return (await store.list(fullName)).find((snapshot) => snapshot.version === version);
}
