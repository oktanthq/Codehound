import type { IngestedPull } from "./types.js";

export type PullStore = {
  save: (pull: IngestedPull) => Promise<IngestedPull>;
  get: (fullName: string, number: number) => Promise<IngestedPull | undefined>;
  list: (fullName: string) => Promise<IngestedPull[]>;
};

function pullKey(fullName: string, number: number): string {
  return `${fullName.toLowerCase()}#${number}`;
}

export class InMemoryPullStore implements PullStore {
  private readonly items = new Map<string, IngestedPull>();

  async save(pull: IngestedPull): Promise<IngestedPull> {
    this.items.set(pullKey(pull.pull.fullName, pull.pull.number), pull);
    return pull;
  }

  async get(fullName: string, number: number): Promise<IngestedPull | undefined> {
    return this.items.get(pullKey(fullName, number));
  }

  async list(fullName: string): Promise<IngestedPull[]> {
    const normalized = fullName.toLowerCase();
    return [...this.items.values()]
      .filter((item) => item.pull.fullName.toLowerCase() === normalized)
      .sort((left, right) => right.pull.number - left.pull.number);
  }
}
