import { parseRepositoryFullName, type SelectedRepository } from "./types.js";

export type SelectionLookup = {
  isSelected: (installationId: number, fullName: string) => Promise<boolean>;
};

export type SelectionStore = SelectionLookup & {
  list: (installationId: number) => Promise<SelectedRepository[]>;
  get: (installationId: number, fullName: string) => Promise<SelectedRepository | undefined>;
  add: (selection: SelectedRepository) => Promise<SelectedRepository>;
  remove: (installationId: number, fullName: string) => Promise<boolean>;
};

function selectionKey(installationId: number, fullName: string): string {
  return `${installationId}:${fullName.toLowerCase()}`;
}

export class InMemorySelectionStore implements SelectionStore {
  private readonly items = new Map<string, SelectedRepository>();

  async list(installationId: number): Promise<SelectedRepository[]> {
    return [...this.items.values()]
      .filter((item) => item.installationId === installationId)
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }

  async get(installationId: number, fullName: string): Promise<SelectedRepository | undefined> {
    return this.items.get(selectionKey(installationId, fullName));
  }

  async isSelected(installationId: number, fullName: string): Promise<boolean> {
    return this.items.has(selectionKey(installationId, fullName));
  }

  async add(selection: SelectedRepository): Promise<SelectedRepository> {
    const { owner, name } = parseRepositoryFullName(selection.fullName);
    const stored: SelectedRepository = {
      ...selection,
      owner,
      name,
      fullName: `${owner}/${name}`,
    };
    this.items.set(selectionKey(stored.installationId, stored.fullName), stored);
    return stored;
  }

  async remove(installationId: number, fullName: string): Promise<boolean> {
    return this.items.delete(selectionKey(installationId, fullName));
  }
}
