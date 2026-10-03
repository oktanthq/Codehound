import type { GitHubApp } from "./app.js";
import type { RepositoryAuthorizer } from "./authz.js";
import { systemClock, type Clock } from "./clock.js";
import { GitHubAppError } from "./errors.js";
import { mapGitHubRepository, type GitHubRepositoryPayload } from "./repository.js";
import type { SelectionStore } from "./selection.js";
import {
  parseRepositoryFullName,
  type RepositoryRef,
  type RepositoryVisibility,
  type SelectedRepository,
} from "./types.js";

export type RepositoryFilter = {
  query?: string;
  language?: string;
  visibility?: RepositoryVisibility | "all";
  includeArchived?: boolean;
  includeForks?: boolean;
};

export type DiscoveredRepository = RepositoryRef & {
  description: string | undefined;
  selected: boolean;
};

export type RepositoryDiscoveryOptions = {
  clock?: Clock;
  pageSize?: number;
};

type InstallationRepositoriesResponse = {
  total_count: number;
  repositories: GitHubRepositoryPayload[];
};

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGES = 100;

function matchesFilter(repo: DiscoveredRepository, filter: RepositoryFilter): boolean {
  if (filter.includeArchived !== true && repo.archived) {
    return false;
  }
  if (filter.includeForks === false && repo.fork) {
    return false;
  }
  if (
    filter.visibility !== undefined &&
    filter.visibility !== "all" &&
    repo.visibility !== filter.visibility
  ) {
    return false;
  }
  if (
    filter.language !== undefined &&
    (repo.language ?? "").toLowerCase() !== filter.language.toLowerCase()
  ) {
    return false;
  }
  if (filter.query !== undefined && filter.query.trim().length > 0) {
    const needle = filter.query.trim().toLowerCase();
    const haystack = `${repo.name} ${repo.fullName} ${repo.description ?? ""}`.toLowerCase();
    if (!haystack.includes(needle)) {
      return false;
    }
  }
  return true;
}

function parseFullName(fullName: string): { owner: string; name: string } {
  try {
    return parseRepositoryFullName(fullName);
  } catch {
    throw new GitHubAppError("Repository full name must be owner/name", "MISSING_CONFIG");
  }
}

export class RepositoryDiscovery {
  private readonly clock: Clock;
  private readonly pageSize: number;

  constructor(
    private readonly app: GitHubApp,
    private readonly authorizer: RepositoryAuthorizer,
    private readonly selections: SelectionStore,
    options: RepositoryDiscoveryOptions = {},
  ) {
    this.clock = options.clock ?? systemClock;
    this.pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  }

  async listAccessible(
    installationId: number,
    filter: RepositoryFilter = {},
  ): Promise<DiscoveredRepository[]> {
    await this.app.getInstallation(installationId);
    const selectedNames = new Set(
      (await this.selections.list(installationId)).map((item) => item.fullName.toLowerCase()),
    );
    const repositories: DiscoveredRepository[] = [];
    let fetched = 0;

    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const result = await this.app.requestAsInstallation<InstallationRepositoriesResponse>(
        installationId,
        {
          method: "GET",
          path: "/installation/repositories",
          query: { per_page: this.pageSize, page },
        },
      );
      const batch = result.data.repositories ?? [];
      fetched += batch.length;
      for (const payload of batch) {
        const mapped = mapGitHubRepository(payload);
        const discovered: DiscoveredRepository = {
          ...mapped,
          description: payload.description ?? undefined,
          selected: selectedNames.has(mapped.fullName.toLowerCase()),
        };
        if (matchesFilter(discovered, filter)) {
          repositories.push(discovered);
        }
      }
      if (
        batch.length === 0 ||
        batch.length < this.pageSize ||
        fetched >= result.data.total_count
      ) {
        break;
      }
    }
    return repositories;
  }

  async select(installationId: number, fullName: string): Promise<SelectedRepository> {
    const { owner, name } = parseFullName(fullName);
    await this.authorizer.assertAuthorized({
      installationId,
      owner,
      repo: name,
      requiredPermissions: { metadata: "read" },
    });
    const existing = await this.selections.get(installationId, `${owner}/${name}`);
    if (existing !== undefined) {
      return existing;
    }
    return this.selections.add({
      installationId,
      owner,
      name,
      fullName: `${owner}/${name}`,
      selectedAt: this.clock.now().toISOString(),
    });
  }

  async deselect(installationId: number, fullName: string): Promise<boolean> {
    const { owner, name } = parseFullName(fullName);
    return this.selections.remove(installationId, `${owner}/${name}`);
  }

  async listSelected(installationId: number): Promise<SelectedRepository[]> {
    return this.selections.list(installationId);
  }
}
