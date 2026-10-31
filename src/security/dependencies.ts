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

function installedVersion(version: string): string | undefined {
  const parsed = parseSemver(version);
  if (parsed === undefined) {
    return undefined;
  }
  return `${parsed.major}.${parsed.minor}.${parsed.patch}`;
}

function yarnDescriptors(header: string): string[] {
  const body = header.replace(/:\s*$/, "").trim();
  const chunks: string[] = [];
  let index = 0;
  while (index < body.length) {
    const char = body[index];
    if (char === '"') {
      let end = index + 1;
      let value = "";
      while (end < body.length && body[end] !== '"') {
        if (body[end] === "\\" && end + 1 < body.length) {
          value += body[end + 1];
          end += 2;
          continue;
        }
        value += body[end];
        end += 1;
      }
      chunks.push(value);
      index = end + 1;
      continue;
    }
    if (char === "," || char === " ") {
      index += 1;
      continue;
    }
    let end = index;
    while (end < body.length && body[end] !== ",") {
      end += 1;
    }
    const bare = body.slice(index, end).trim();
    if (bare.length > 0) {
      chunks.push(bare);
    }
    index = end;
  }
  return chunks.flatMap((chunk) =>
    chunk
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.length > 0),
  );
}

function nameFromDescriptor(descriptor: string): string | undefined {
  const protocol = descriptor.indexOf("@npm:");
  const at =
    protocol !== -1
      ? protocol
      : descriptor.startsWith("@")
        ? descriptor.indexOf("@", 1)
        : descriptor.indexOf("@");
  if (at <= 0) {
    return undefined;
  }
  return descriptor.slice(0, at);
}

function yarnVersion(line: string): string | undefined {
  const classic = line.match(/^\s+version\s+"([^"]+)"\s*$/);
  if (classic?.[1] !== undefined) {
    return installedVersion(classic[1]);
  }
  const berry = line.match(/^\s+version:\s+"?([^"\s]+)"?\s*$/);
  if (berry?.[1] !== undefined) {
    return installedVersion(berry[1]);
  }
  return undefined;
}

function yarnPackages(content: string, path: string): InstalledPackage[] {
  const packages: InstalledPackage[] = [];
  const lines = content.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (
      line.length === 0 ||
      line.startsWith("#") ||
      line.startsWith(" ") ||
      line.startsWith("\t") ||
      !line.endsWith(":")
    ) {
      continue;
    }
    const name = yarnDescriptors(line)
      .map(nameFromDescriptor)
      .find((value) => value !== undefined);
    if (name === undefined) {
      continue;
    }
    let version: string | undefined;
    for (let next = index + 1; next < lines.length; next += 1) {
      const following = lines[next] ?? "";
      if (
        following.length > 0 &&
        !following.startsWith(" ") &&
        !following.startsWith("\t") &&
        !following.startsWith("#")
      ) {
        break;
      }
      version = yarnVersion(following) ?? version;
    }
    if (version === undefined) {
      continue;
    }
    packages.push({ name, version, path, development: false });
  }
  return packages;
}

function pnpmPackageKey(raw: string): { name: string; version: string } | undefined {
  let key = raw.trim();
  if ((key.startsWith("'") && key.endsWith("'")) || (key.startsWith('"') && key.endsWith('"'))) {
    key = key.slice(1, -1);
  }
  if (key.startsWith("/")) {
    key = key.slice(1);
  }
  const paren = key.indexOf("(");
  if (paren !== -1) {
    key = key.slice(0, paren);
  }
  const at = key.startsWith("@") ? key.indexOf("@", 1) : key.indexOf("@");
  if (at <= 0) {
    return undefined;
  }
  const version = installedVersion(key.slice(at + 1));
  if (version === undefined) {
    return undefined;
  }
  return { name: key.slice(0, at), version };
}

function pnpmPackages(content: string, path: string): InstalledPackage[] {
  const packages: InstalledPackage[] = [];
  const lines = content.split(/\r?\n/);
  let inPackages = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (!inPackages) {
      if (line.trim() === "packages:") {
        inPackages = true;
      }
      continue;
    }
    if (/^\S/.test(line)) {
      break;
    }
    const key = line.match(/^(\s+)(\S.*?):\s*$/);
    if (key === null || key[1] === undefined || key[2] === undefined) {
      continue;
    }
    const parsed = pnpmPackageKey(key[2]);
    if (parsed === undefined) {
      continue;
    }
    const indent = key[1].length;
    let development = false;
    for (let next = index + 1; next < lines.length; next += 1) {
      const following = lines[next] ?? "";
      if (following.trim() === "" || following.trim().startsWith("#")) {
        continue;
      }
      const followingIndent = following.match(/^\s*/)?.[0].length ?? 0;
      if (followingIndent <= indent) {
        break;
      }
      if (/^\s+dev:\s*true\s*$/.test(following)) {
        development = true;
      }
    }
    packages.push({
      name: parsed.name,
      version: parsed.version,
      path,
      development,
    });
  }
  return packages;
}

export function parseInstalledPackages(manifests: readonly ManifestFile[]): InstalledPackage[] {
  const fromLock: InstalledPackage[] = [];
  let fromPackage: InstalledPackage[] = [];
  for (const manifest of manifests) {
    if (manifest.path.endsWith("package-lock.json")) {
      const json = parseJson(manifest.content);
      const v2 = lockfileV2Packages(json, manifest.path);
      fromLock.push(...(v2.length > 0 ? v2 : lockfileV1Packages(json, manifest.path)));
    } else if (manifest.path.endsWith("yarn.lock")) {
      fromLock.push(...yarnPackages(manifest.content, manifest.path));
    } else if (manifest.path.endsWith("pnpm-lock.yaml")) {
      fromLock.push(...pnpmPackages(manifest.content, manifest.path));
    } else if (manifest.path.endsWith("package.json")) {
      fromPackage = declaredVersions(parseJson(manifest.content));
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
            patchedVersion: advisory.patchedVersion,
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
