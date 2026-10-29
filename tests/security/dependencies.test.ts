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

  it("parses yarn classic lockfiles, including scoped names and multiple ranges", () => {
    const installed = parseInstalledPackages([
      {
        path: "yarn.lock",
        content: `# yarn lockfile v1

"@scope/pkg@^1.0.0", "@scope/pkg@^2.0.0":
  version "1.2.3"
  resolved "https://registry.yarnpkg.com/@scope/pkg/-/pkg-1.2.3.tgz"

lodash@^4.17.15:
  version "4.17.20"

minimist@^1.2.0:
  version "1.2.5"
`,
      },
      {
        path: "package.json",
        content: JSON.stringify({ dependencies: { lodash: "^4.17.21" } }),
      },
    ]);
    expect(installed).toEqual([
      expect.objectContaining({
        name: "@scope/pkg",
        version: "1.2.3",
        path: "yarn.lock",
        development: false,
      }),
      expect.objectContaining({ name: "lodash", version: "4.17.20", path: "yarn.lock" }),
      expect.objectContaining({ name: "minimist", version: "1.2.5", path: "yarn.lock" }),
    ]);
  });

  it("parses Yarn Berry lockfiles", () => {
    const installed = parseInstalledPackages([
      {
        path: "yarn.lock",
        content: `__metadata:
  version: 6
  cacheKey: 8

"@scope/pkg@npm:^1.0.0, @scope/pkg@npm:^2.0.0":
  version: 1.2.3
  resolution: "@scope/pkg@npm:1.2.3"

"minimist@npm:^1.2.0":
  version: 1.2.5
  resolution: "minimist@npm:1.2.5"
`,
      },
    ]);
    expect(installed).toEqual([
      expect.objectContaining({ name: "@scope/pkg", version: "1.2.3", development: false }),
      expect.objectContaining({ name: "minimist", version: "1.2.5" }),
    ]);
  });

  it("parses pnpm v6 and v9 lockfiles and keeps dev flags", () => {
    const v6 = parseInstalledPackages([
      {
        path: "pnpm-lock.yaml",
        content: `lockfileVersion: '6.0'

packages:

  /lodash@4.17.20:
    resolution: {integrity: sha512-abc}

  /minimist@1.2.5:
    resolution: {integrity: sha512-def}

  /@scope/pkg@1.2.3:
    resolution: {integrity: sha512-ghi}
    dev: true
`,
      },
    ]);
    expect(v6).toEqual([
      expect.objectContaining({ name: "lodash", version: "4.17.20", development: false }),
      expect.objectContaining({ name: "minimist", version: "1.2.5", development: false }),
      expect.objectContaining({ name: "@scope/pkg", version: "1.2.3", development: true }),
    ]);

    const v9 = parseInstalledPackages([
      {
        path: "apps/web/pnpm-lock.yaml",
        content: `lockfileVersion: '9.0'

importers:

  .:
    dependencies:
      lodash:
        specifier: ^4.17.21
        version: 4.17.21

packages:

  lodash@4.17.21:
    resolution: {integrity: sha512-abc}

  minimist@1.2.5:
    resolution: {integrity: sha512-def}

  '@scope/pkg@1.2.3':
    resolution: {integrity: sha512-ghi}
    dev: true

snapshots:

  lodash@4.17.21: {}

  minimist@1.2.5: {}
`,
      },
    ]);
    expect(v9).toEqual([
      expect.objectContaining({
        name: "lodash",
        version: "4.17.21",
        path: "apps/web/pnpm-lock.yaml",
      }),
      expect.objectContaining({ name: "minimist", version: "1.2.5" }),
      expect.objectContaining({ name: "@scope/pkg", version: "1.2.3", development: true }),
    ]);
    expect(v9).toHaveLength(3);
  });

  it("reports a transitive advisory that exists only in a yarn or pnpm lockfile", async () => {
    const scanner = new DependencyScanner(new LocalAdvisoryDatabase());
    const packageJson = JSON.stringify({ dependencies: { express: "4.19.2" } });
    const yarnFindings = await scanner.scan(
      securityContext({
        "package.json": packageJson,
        "yarn.lock": `express@^4.19.2:
  version "4.19.2"

minimist@^1.2.0:
  version "1.2.5"
`,
      }),
    );
    expect(yarnFindings.map((finding) => finding.packageName)).toEqual(["minimist"]);
    expect(yarnFindings[0]?.cve).toBe("CVE-2021-44906");

    const pnpmFindings = await scanner.scan(
      securityContext({
        "package.json": packageJson,
        "pnpm-lock.yaml": `lockfileVersion: '9.0'

packages:

  express@4.19.2:
    resolution: {integrity: sha512-abc}

  minimist@1.2.5:
    resolution: {integrity: sha512-def}
`,
      }),
    );
    expect(pnpmFindings.map((finding) => finding.packageName)).toEqual(["minimist"]);
    expect(pnpmFindings[0]?.cve).toBe("CVE-2021-44906");
  });
});
