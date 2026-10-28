import { importPKCS8, SignJWT } from "jose";
import { systemClock, type Clock } from "./clock.js";
import { GitHubAppError } from "./errors.js";
import type { GitHubAppCredentials } from "./types.js";

export type GitHubAppJwt = {
  token: string;
  iat: number;
  exp: number;
};

const MAX_LIFETIME_SECONDS = 600;
const DEFAULT_LIFETIME_SECONDS = 540;
const IAT_SKEW_SECONDS = 60;

export async function createGitHubAppJwt(
  credentials: Pick<GitHubAppCredentials, "appId" | "privateKey">,
  options: { clock?: Clock; lifetimeSeconds?: number } = {},
): Promise<GitHubAppJwt> {
  const lifetime = options.lifetimeSeconds ?? DEFAULT_LIFETIME_SECONDS;
  if (lifetime < 1 || lifetime > MAX_LIFETIME_SECONDS) {
    throw new GitHubAppError(
      "GitHub App JWTs must live between 1 and 600 seconds",
      "INVALID_JWT_LIFETIME",
    );
  }

  const clock = options.clock ?? systemClock;
  const now = clock.nowSeconds();
  const iat = now - IAT_SKEW_SECONDS;
  const exp = now + lifetime;

  try {
    const key = await importPKCS8(credentials.privateKey, "RS256");
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "RS256", typ: "JWT" })
      .setIssuedAt(iat)
      .setExpirationTime(exp)
      .setIssuer(credentials.appId)
      .sign(key);
    return { token, iat, exp };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    throw new GitHubAppError(`Failed to sign GitHub App JWT: ${message}`, "INVALID_PRIVATE_KEY");
  }
}
