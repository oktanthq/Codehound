export type PermissionLevel = "read" | "write" | "admin";

export type RepositoryVisibility = "public" | "private" | "internal";

export type GitHubAppCredentials = {
  appId: string;
  privateKey: string;
  apiBaseUrl: string;
  clientId?: string;
  clientSecret?: string;
  webhookSecret?: string;
};

export type InstallationAccount = {
  id: number;
  login: string;
  type: string;
};

export type Installation = {
  id: number;
  account: InstallationAccount;
  appId: number;
  targetType: string;
  repositorySelection: "all" | "selected";
  permissions: Record<string, PermissionLevel>;
  suspendedAt: string | undefined;
};

export type InstallationToken = {
  token: string;
  expiresAt: Date;
  installationId: number;
  permissions: Record<string, PermissionLevel>;
  repositorySelection: "all" | "selected";
};

export type RepositoryRef = {
  id: number;
  name: string;
  fullName: string;
  owner: string;
  private: boolean;
  fork: boolean;
  archived: boolean;
  disabled: boolean;
  defaultBranch: string;
  language: string | undefined;
  visibility: RepositoryVisibility;
  htmlUrl: string;
  cloneUrl: string;
  size: number;
};

export type SelectedRepository = {
  installationId: number;
  fullName: string;
  owner: string;
  name: string;
  selectedAt: string;
};

export const PERMISSION_RANK: Record<PermissionLevel, number> = {
  read: 1,
  write: 2,
  admin: 3,
};

export function permissionSatisfies(
  actual: PermissionLevel | undefined,
  required: PermissionLevel,
): boolean {
  if (actual === undefined) {
    return false;
  }
  return PERMISSION_RANK[actual] >= PERMISSION_RANK[required];
}

export function parseRepositoryFullName(fullName: string): { owner: string; name: string } {
  const trimmed = fullName.trim().replace(/^\/+|\/+$/g, "");
  const parts = trimmed.split("/");
  if (parts.length !== 2 || parts[0] === undefined || parts[1] === undefined) {
    throw new Error(`Repository full name must be owner/name, got: ${fullName}`);
  }
  const owner = parts[0].trim();
  const name = parts[1].trim();
  if (owner.length === 0 || name.length === 0) {
    throw new Error(`Repository full name must be owner/name, got: ${fullName}`);
  }
  return { owner, name };
}
