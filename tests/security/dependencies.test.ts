import { describe, expect, it } from "vitest";
import { LocalAdvisoryDatabase } from "../../src/security/advisories.js";
import { securityContext } from "../../src/security/architecture.js";
import { DependencyScanner, parseInstalledPackages } from "../../src/security/dependencies.js";
import { versionSatisfies } from "../../src/security/semver.js";

describe("dependency vulnerability scanning", () => {
  it("matches lockfile versions against the local advisory database", async () => {
    const lockfile = JSON.stringify({
      packages: {
        "": { dependencies: { lodash: "4.17.20" } },
        "node_modules/lodash": { version: "4.17.20" },
        "node_modules/minimist": { version: "1.2.5" },
        "node_modules/express": { version: "4.19.2" },
      },
    });
    const scanner = new DependencyScanner(new LocalAdvisoryDatabase());
    const findings = await scanner.scan(
      securityContext({
        "package-lock.json": lockfile,
        "package.json": JSON.stringify({
          dependencies: { lodash: "^4.17.20", express: "4.19.2" },
        }),
      }),
    );
    const names = findings.map((finding) => finding.packageName);
    expect(names).toContain("lodash");
    expect(names).toContain("minimist");
    expect(names).not.toContain("express");
    expect(findings.find((finding) => finding.packageName === "lodash")?.cve).toBe(
      "CVE-2021-23337",
    );
  });

  it("falls back to package.json when no lockfile is present", () => {
    const installed = parseInstalledPackages([
      {
        path: "package.json",
        content: JSON.stringify({
          dependencies: { jsonwebtoken: "8.5.1" },
          devDependencies: { ws: "8.0.0" },
        }),
      },
    ]);
    expect(installed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "jsonwebtoken", version: "8.5.1", development: false }),
        expect.objectContaining({ name: "ws", version: "8.0.0", development: true }),
      ]),
    );
    expect(versionSatisfies("8.5.1", "<9.0.0")).toBe(true);
    expect(versionSatisfies("9.0.0", "<9.0.0")).toBe(false);
  });
});
