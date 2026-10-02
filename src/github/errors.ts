export type GitHubErrorCode =
  | "MISSING_CONFIG"
  | "INVALID_PRIVATE_KEY"
  | "INVALID_JWT_LIFETIME"
  | "GITHUB_HTTP_ERROR"
  | "INSTALLATION_SUSPENDED"
  | "INSTALLATION_NOT_FOUND"
  | "REPOSITORY_NOT_FOUND"
  | "REPOSITORY_DISABLED"
  | "INSUFFICIENT_PERMISSION"
  | "REPOSITORY_NOT_SELECTED"
  | "REPOSITORY_NOT_ACCESSIBLE"
  | "CLONE_FAILED"
  | "INGEST_FAILED";

export class GitHubAppError extends Error {
  readonly code: GitHubErrorCode;
  readonly status: number | undefined;

  constructor(message: string, code: GitHubErrorCode, status?: number) {
    super(message);
    this.name = "GitHubAppError";
    this.code = code;
    this.status = status;
  }
}

export function redactSecrets(value: string, secrets: readonly string[]): string {
  let redacted = value;
  for (const secret of secrets) {
    if (secret.length === 0) {
      continue;
    }
    redacted = redacted.split(secret).join("[redacted]");
  }
  return redacted;
}
