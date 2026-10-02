import { describe, expect, it } from "vitest";
import { loadGitHubAppConfig, normalizePrivateKey } from "../../src/github/config.js";
import { GitHubAppError } from "../../src/github/errors.js";
import { generateTestAppKeys } from "../helpers/keys.js";

describe("loadGitHubAppConfig", () => {
  it("loads credentials from environment variables", () => {
    const keys = generateTestAppKeys();
    const config = loadGitHubAppConfig({
      GITHUB_APP_ID: "99",
      GITHUB_APP_PRIVATE_KEY: keys.privateKeyPkcs8,
      GITHUB_APP_CLIENT_ID: "client",
      GITHUB_APP_CLIENT_SECRET: "secret",
      GITHUB_APP_WEBHOOK_SECRET: "hook",
      GITHUB_API_URL: "https://github.example.com/api/v3/",
    });

    expect(config.appId).toBe("99");
    expect(config.clientId).toBe("client");
    expect(config.clientSecret).toBe("secret");
    expect(config.webhookSecret).toBe("hook");
    expect(config.apiBaseUrl).toBe("https://github.example.com/api/v3");
    expect(config.privateKey).toContain("BEGIN PRIVATE KEY");
  });

  it("accepts PKCS#1 keys and escaped newlines", () => {
    const keys = generateTestAppKeys();
    const escaped = keys.privateKeyPkcs1.replace(/\n/g, "\\n");
    const pem = normalizePrivateKey(escaped);
    expect(pem).toContain("BEGIN PRIVATE KEY");
  });

  it("accepts base64-encoded PEM", () => {
    const keys = generateTestAppKeys();
    const encoded = Buffer.from(keys.privateKeyPkcs8).toString("base64");
    const pem = normalizePrivateKey(encoded);
    expect(pem).toContain("BEGIN PRIVATE KEY");
  });

  it("rejects missing required variables", () => {
    expect(() => loadGitHubAppConfig({})).toThrow(GitHubAppError);
    try {
      loadGitHubAppConfig({});
    } catch (error) {
      expect(error).toBeInstanceOf(GitHubAppError);
      expect((error as GitHubAppError).code).toBe("MISSING_CONFIG");
    }
  });

  it("rejects invalid private keys", () => {
    expect(() => normalizePrivateKey("not-a-key")).toThrow(GitHubAppError);
  });
});
