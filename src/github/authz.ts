import type { GitHubApp } from "./app.js";
import { GitHubAppError, type GitHubErrorCode } from "./errors.js";
import { mapGitHubRepository, type GitHubRepositoryPayload } from "./repository.js";
import type { SelectionLookup } from "./selection.js";
import {
  parseRepositoryFullName,
  permissionSatisfies,
  type Installation,
  type PermissionLevel,
  type RepositoryRef,
} from "./types.js";

export type AuthorizationRequest = {
  installationId: number;
  owner?: string;
  repo?: string;
  fullName?: string;
  requiredPermissions?: Record<string, PermissionLevel>;
  requireSelected?: boolean;
};

export type AuthorizedAccess = {
  allowed: true;
  repository: RepositoryRef;
  installation: Installation;
  permissions: Record<string, PermissionLevel>;
};

export type DeniedAccess = {
  allowed: false;
  reason: GitHubErrorCode;
  message: string;
};

export type AuthorizationDecision = AuthorizedAccess | DeniedAccess;

function resolveNames(request: AuthorizationRequest): {
  owner: string;
  name: string;
  fullName: string;
} {
  if (request.fullName !== undefined) {
    const parsed = parseRepositoryFullName(request.fullName);
    return { owner: parsed.owner, name: parsed.name, fullName: `${parsed.owner}/${parsed.name}` };
  }
  if (request.owner === undefined || request.repo === undefined) {
    throw new GitHubAppError("Repository owner and name are required", "MISSING_CONFIG");
  }
  const owner = request.owner.trim();
  const name = request.repo.trim();
  if (owner.length === 0 || name.length === 0) {
    throw new GitHubAppError("Repository owner and name are required", "MISSING_CONFIG");
  }
  return { owner, name, fullName: `${owner}/${name}` };
}

function deny(reason: GitHubErrorCode, message: string): DeniedAccess {
  return { allowed: false, reason, message };
}

export class RepositoryAuthorizer {
  constructor(
    private readonly app: GitHubApp,
    private readonly selections?: SelectionLookup,
  ) {}

  async authorize(request: AuthorizationRequest): Promise<AuthorizationDecision> {
    const { owner, name, fullName } = resolveNames(request);

    let installation: Installation;
    try {
      installation = await this.app.getInstallation(request.installationId);
    } catch (error) {
      if (error instanceof GitHubAppError) {
        return deny(error.code, error.message);
      }
      throw error;
    }

    const token = await this.app.getInstallationToken(request.installationId);
    const missing = Object.entries(request.requiredPermissions ?? {}).filter(
      ([permission, required]) => !permissionSatisfies(token.permissions[permission], required),
    );
    if (missing.length > 0) {
      const detail = missing
        .map(([permission, required]) => `${permission}:${required}`)
        .join(", ");
      return deny(
        "INSUFFICIENT_PERMISSION",
        `Installation ${request.installationId} lacks required GitHub permission(s): ${detail}`,
      );
    }

    if (request.requireSelected === true) {
      if (this.selections === undefined) {
        throw new GitHubAppError(
          "Selection lookup is required when requireSelected is true",
          "MISSING_CONFIG",
        );
      }
      const selected = await this.selections.isSelected(request.installationId, fullName);
      if (!selected) {
        return deny(
          "REPOSITORY_NOT_SELECTED",
          `Repository ${fullName} is not selected for installation ${request.installationId}`,
        );
      }
    }

    try {
      const result = await this.app.requestAsInstallation<GitHubRepositoryPayload>(
        request.installationId,
        {
          method: "GET",
          path: `/repos/${owner}/${name}`,
        },
      );
      const repository = mapGitHubRepository(result.data);
      if (repository.disabled) {
        return deny("REPOSITORY_DISABLED", `Repository ${fullName} is disabled`);
      }
      return {
        allowed: true,
        repository,
        installation,
        permissions: token.permissions,
      };
    } catch (error) {
      if (error instanceof GitHubAppError && (error.status === 404 || error.status === 403)) {
        return deny(
          "REPOSITORY_NOT_ACCESSIBLE",
          `Installation ${request.installationId} cannot access ${fullName}`,
        );
      }
      throw error;
    }
  }

  async assertAuthorized(request: AuthorizationRequest): Promise<AuthorizedAccess> {
    const decision = await this.authorize(request);
    if (!decision.allowed) {
      throw new GitHubAppError(decision.message, decision.reason);
    }
    return decision;
  }
}
