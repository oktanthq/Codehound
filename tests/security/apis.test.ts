import { describe, expect, it } from "vitest";
import { securityContext } from "../../src/security/architecture.js";
import { InsecureApiScanner } from "../../src/security/apis.js";

describe("insecure API usage detection", () => {
  it("flags weak hashes, insecure random, cleartext HTTP, and CORS wildcards", () => {
    const findings = new InsecureApiScanner().scan(
      securityContext({
        "src/crypto.ts": [
          'import { createHash, createCipher } from "crypto";',
          'const digest = createHash("md5").update(password).digest("hex");',
          "const token = Math.random().toString(36);",
          'fetch("http://example.com/api");',
          "const buf = new Buffer(16);",
          'const cipher = createCipher("aes192", "key");',
          'cors({ origin: "*" });',
          "res.cookie('sid', id, { httpOnly: false });",
          "spawn('ls', { shell: true });",
        ].join("\n"),
      }),
    );
    const ids = findings.map((finding) => finding.ruleId);
    expect(ids).toContain("api.weak-hash");
    expect(ids).toContain("api.insecure-random");
    expect(ids).toContain("api.cleartext-http");
    expect(ids).toContain("api.legacy-buffer");
    expect(ids).toContain("api.legacy-cipher");
    expect(ids).toContain("api.cors-any");
    expect(ids).toContain("api.cookie-flags");
    expect(ids).toContain("api.shell-true");
  });

  it("allows https URLs and cryptographically strong hashes", () => {
    const findings = new InsecureApiScanner().scan(
      securityContext({
        "src/ok.ts": [
          'createHash("sha256").update(password);',
          'fetch("https://example.com/api");',
          "const n = Math.random();",
        ].join("\n"),
      }),
    );
    expect(findings.some((finding) => finding.ruleId === "api.weak-hash")).toBe(false);
    expect(findings.some((finding) => finding.ruleId === "api.cleartext-http")).toBe(false);
    expect(findings.some((finding) => finding.ruleId === "api.insecure-random")).toBe(false);
  });
});
