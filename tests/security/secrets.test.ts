import { describe, expect, it } from "vitest";
import { securityContext } from "../../src/security/architecture.js";
import { SecretScanner, shannonEntropy } from "../../src/security/secrets.js";

describe("secret and sensitive-data detection", () => {
  it("finds tokens, private keys, and hardcoded passwords", () => {
    const findings = new SecretScanner().scan(
      securityContext({
        "src/config.ts": [
          'const accessKey = "AKIAIOSFODNN7EXAMPLE";',
          'const token = "ghp_abcdefghijklmnopqrstuvwxyz0123456789";',
          "const pem = '-----BEGIN RSA PRIVATE KEY-----';",
          'const password = "hunter2secret";',
          'const db = "postgres://user:s3cret@db.internal/app";',
        ].join("\n"),
      }),
    );
    const ids = findings.map((finding) => finding.ruleId);
    expect(ids).toContain("secret.aws-access-key");
    expect(ids).toContain("secret.github-token");
    expect(ids).toContain("secret.private-key");
    expect(ids).toContain("secret.hardcoded");
    expect(ids).toContain("secret.connection-string");
  });

  it("ignores env lookups, placeholders, and lockfile hashes", () => {
    const findings = new SecretScanner().scan(
      securityContext({
        "src/ok.ts": [
          'const password = process.env.PASSWORD;',
          'const apiKey = "changeme";',
          'const token = "placeholder";',
        ].join("\n"),
        "package-lock.json": JSON.stringify({
          packages: {
            "node_modules/x": {
              integrity: "sha512-abcdefghijklmnopqrstuvwxyz0123456789+/==",
            },
          },
        }),
      }),
    );
    expect(findings).toEqual([]);
    expect(shannonEntropy("aaaaaaaaaaaaaaaaaaaa")).toBeLessThan(1);
    expect(shannonEntropy("n9q2m8K4xR7bP1zL0sT")).toBeGreaterThan(3);
  });
});
