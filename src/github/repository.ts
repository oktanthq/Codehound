import type { RepositoryRef, RepositoryVisibility } from "./types.js";

type GitHubRepositoryPayload = {
  id: number;
  name: string;
  full_name: string;
  owner: { login: string };
  private: boolean;
  fork: boolean;
  archived: boolean;
  disabled: boolean;
  default_branch: string;
  language: string | null;
  visibility?: string;
  html_url: string;
  clone_url: string;
  size: number;
  description?: string | null;
};

function visibilityFrom(payload: GitHubRepositoryPayload): RepositoryVisibility {
  if (
    payload.visibility === "public" ||
    payload.visibility === "private" ||
    payload.visibility === "internal"
  ) {
    return payload.visibility;
  }
  return payload.private ? "private" : "public";
}

export function mapGitHubRepository(payload: GitHubRepositoryPayload): RepositoryRef {
  return {
    id: payload.id,
    name: payload.name,
    fullName: payload.full_name,
    owner: payload.owner.login,
    private: payload.private,
    fork: payload.fork,
    archived: payload.archived,
    disabled: payload.disabled,
    defaultBranch: payload.default_branch,
    language: payload.language ?? undefined,
    visibility: visibilityFrom(payload),
    htmlUrl: payload.html_url,
    cloneUrl: payload.clone_url,
    size: payload.size,
  };
}

export type { GitHubRepositoryPayload };
