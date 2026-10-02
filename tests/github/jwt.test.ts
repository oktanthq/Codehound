import { importSPKI, jwtVerify } from "jose";
import { describe, expect, it } from "vitest";
import { loadGitHubAppConfig } from "../../src/github/config.js";
import { createGitHubAppJwt } from "../../src/github/jwt.js";
import { generateTestAppKeys } from "../helpers/keys.js";

describe("createGitHubAppJwt", () => {
  it("signs an RS256 JWT with GitHub App claims", async () => {
    const keys = generateTestAppKeys();
    const credentials = loadGitHubAppConfig({
      GITHUB_APP_ID: "4242",
      GITHUB_APP_PRIVATE_KEY: keys.privateKeyPkcs8,
    });
    const now = 1_700_000_000;
    const jwt = await createGitHubAppJwt(credentials, {
      clock: { nowSeconds: () => now, now: () => new Date(now * 1000) },
      lifetimeSeconds: 540,
    });

    const publicKey = await importSPKI(keys.publicKey, "RS256");
    const { payload, protectedHeader } = await jwtVerify(jwt.token, publicKey, {
      currentDate: new Date(now * 1000),
    });

    expect(protectedHeader.alg).toBe("RS256");
    expect(protectedHeader.typ).toBe("JWT");
    expect(payload.iss).toBe("4242");
    expect(payload.iat).toBe(now - 60);
    expect(payload.exp).toBe(now + 540);
    expect(jwt.token.split(".")).toHaveLength(3);
  });

  it("rejects lifetimes longer than 10 minutes", async () => {
    const keys = generateTestAppKeys();
    const credentials = loadGitHubAppConfig({
      GITHUB_APP_ID: "1",
      GITHUB_APP_PRIVATE_KEY: keys.privateKeyPkcs8,
    });
    await expect(createGitHubAppJwt(credentials, { lifetimeSeconds: 601 })).rejects.toMatchObject({
      code: "INVALID_JWT_LIFETIME",
    });
  });
});
