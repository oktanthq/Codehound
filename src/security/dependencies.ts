import type { AdvisoryDatabase, VulnerabilityScanner } from "./architecture.js";
import { LocalAdvisoryDatabase } from "./advisories.js";
import { parseSemver } from "./semver.js";
import {
  makeVulnerability,
  type ManifestFile,
  type SecurityScanContext,
  type VulnerabilityFinding,
} from "./types.js";

export type InstalledPackage = {
  name: string;
  version: string;
  path: string;
  development: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseJson(content: string): unknown {
  try {
    return JSON.parse(content) as unknown;
  } catch {
    return undefined;
  }
}

function declaredVersions(manifest: unknown): InstalledPackage[] {
  if (!isRecord(manifest)) {
    return [];
  }
  const groups: { key: string; development: boolean }[] = [
    { key: "dependencies", development: false },
    { key: "optionalDependencies", development: false },
    { key: "peerDependencies", development: false },
    { key: "devDependencies", development: true },
  ];
  const packages: InstalledPackage[] = [];
  for (const group of groups) {
    const block = manifest[group.key];
    if (!isRecord(block)) {
      continue;
    }
    for (const [name, range] of Object.entries(block)) {
      if (typeof range !== "string") {
        continue;
      }
      const version = parseSemver(range);
      if (version === undefined) {
        continue;
      }
      packages.push({
        name,
        version: `${version.major}.${version.minor}.${version.patch}`,
        path: "package.json",
        development: group.development,
      });
    }
  }
  return packages;
}

function lockfileV2Packages(lockfile: unknown, path: string): InstalledPackage[] {
  if (!isRecord(lockfile) || !isRecord(lockfile.packages)) {
    return [];
  }
  const packages: InstalledPackage[] = [];
  for (const [key, value] of Object.entries(lockfile.packages)) {
    if (!key.startsWith("node_modules/") || !isRecord(value) || typeof value.version !== "string") {
      continue;
    }
    const name = key.slice("node_modules/".length);
    if (name.includes("/node_modules/")) {
      continue;
    }
    packages.push({
      name,
      version: value.version,
      path,
      development: value.dev === true,
    });
  }
  return packages;
}

function lockfileV1Packages(
  node: unknown,
  path: string,
  found: InstalledPackage[] = [],
): InstalledPackage[] {
  if (!isRecord(node) || !isRecord(node.dependencies)) {
    return found;
  }
  for (const [name, value] of Object.entries(node.dependencies)) {
    if (!isRecord(value) || typeof value.version !== "string") {
      continue;
    }
    found.push({
      name,
      version: value.version,
      path,
      development: value.dev === true,
    });
    lockfileV1Packages(value, path, found);
  }
  return found;
}

export function parseInstalledPackages(manifests: readonly ManifestFile[]): InstalledPackage[] {
  const fromLock: InstalledPackage[] = [];
  let fromPackage: InstalledPackage[] = [];
  for (const manifest of manifests) {
    const json = parseJson(manifest.content);
    if (manifest.path.endsWith("package-lock.json")) {
      const v2 = lockfileV2Packages(json, manifest.path);
      fromLock.push(...(v2.length > 0 ? v2 : lockfileV1Packages(json, manifest.path)));
    } else if (manifest.path.endsWith("package.json")) {
      fromPackage = declaredVersions(json);
    }
  }
  if (fromLock.length > 0) {
    return fromLock;
  }
  return fromPackage;
}

export class DependencyScanner implements VulnerabilityScanner {
  readonly id = "dependency";

  constructor(private readonly advisories: AdvisoryDatabase = new LocalAdvisoryDatabase()) {}

  async scan(context: SecurityScanContext): Promise<VulnerabilityFinding[]> {
    const installed = parseInstalledPackages(context.manifests);
    const findings: VulnerabilityFinding[] = [];
    for (const pkg of installed) {
      const hits = await this.advisories.lookup(pkg.name, pkg.version);
      for (const advisory of hits) {
        findings.push(
          makeVulnerability({
            category: "dependency",
            ruleId: "dependency.advisory",
            severity: advisory.severity,
            title: advisory.title,
            message: `${pkg.name}@${pkg.version} matches ${advisory.id} (${advisory.vulnerableRange}).`,
            path: pkg.path,
            evidence: `${pkg.name}@${pkg.version}`,
            cwe: advisory.cwe,
            cve: advisory.cve,
            packageName: pkg.name,
            packageVersion: pkg.version,
          }),
        );
      }
    }
    return findings;
  }
}

export function dependencyScanner(advisories?: AdvisoryDatabase): VulnerabilityScanner {
  return new DependencyScanner(advisories ?? new LocalAdvisoryDatabase());
}
