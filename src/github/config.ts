import { createPrivateKey } from "node:crypto";
import { GitHubAppError } from "./errors.js";
import type { GitHubAppCredentials } from "./types.js";

export type EnvMap = Record<string, string | undefined>;

function readOptional(env: EnvMap, key: string): string | undefined {
  const value = env[key]?.trim();
  if (value === undefined || value.length === 0) {
    return undefined;
  }
  return value;
}

function readRequired(env: EnvMap, key: string): string {
  const value = readOptional(env, key);
  if (value === undefined) {
    throw new GitHubAppError(`Missing required environment variable ${key}`, "MISSING_CONFIG");
  }
  return value;
}

export function normalizePrivateKey(raw: string): string {
  let pem = raw.trim();
  if (pem.includes("\\n") && !pem.includes("\n")) {
    pem = pem.replace(/\\n/g, "\n");
  }
  if (!pem.includes("BEGIN")) {
    try {
      pem = Buffer.from(pem, "base64").toString("utf8").trim();
    } catch {
      throw new GitHubAppError(
        "GitHub App private key is not valid PEM or base64 PEM",
        "INVALID_PRIVATE_KEY",
      );
    }
  }
  if (!pem.includes("BEGIN")) {
    throw new GitHubAppError(
      "GitHub App private key is not valid PEM or base64 PEM",
      "INVALID_PRIVATE_KEY",
    );
  }
  try {
    const key = createPrivateKey(pem);
    return key.export({ type: "pkcs8", format: "pem" }).toString();
  } catch {
    throw new GitHubAppError("GitHub App private key could not be parsed", "INVALID_PRIVATE_KEY");
  }
}

export function loadGitHubAppConfig(env: EnvMap = process.env): GitHubAppCredentials {
  const appId = readRequired(env, "GITHUB_APP_ID");
  const privateKey = normalizePrivateKey(readRequired(env, "GITHUB_APP_PRIVATE_KEY"));
  const apiBaseUrl = (readOptional(env, "GITHUB_API_URL") ?? "https://api.github.com").replace(
    /\/+$/,
    "",
  );

  const credentials: GitHubAppCredentials = { appId, privateKey, apiBaseUrl };
  const clientId = readOptional(env, "GITHUB_APP_CLIENT_ID");
  const clientSecret = readOptional(env, "GITHUB_APP_CLIENT_SECRET");
  const webhookSecret = readOptional(env, "GITHUB_APP_WEBHOOK_SECRET");
  if (clientId !== undefined) {
    credentials.clientId = clientId;
  }
  if (clientSecret !== undefined) {
    credentials.clientSecret = clientSecret;
  }
  if (webhookSecret !== undefined) {
    credentials.webhookSecret = webhookSecret;
  }
  return credentials;
}
