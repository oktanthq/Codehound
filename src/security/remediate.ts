import type { Suggestion, SuggestionChange } from "../suggestions/types.js";
import { combinePatches, unifiedDiff } from "../suggestions/patch.js";
import type { VulnerabilityFinding } from "./types.js";

function rewriteLine(ruleId: string, line: string): string | undefined {
  if (ruleId === "sast.eval" || ruleId === "dataflow.taint-eval") {
    return line.replaceAll(/\beval\s*\(/g, "JSON.parse(");
  }
  if (
    ruleId === "sast.xss-html" ||
    ruleId === "injection.xss" ||
    ruleId === "dataflow.taint-html"
  ) {
    return line
      .replaceAll(/\.innerHTML\b/g, ".textContent")
      .replaceAll(/\.outerHTML\b/g, ".textContent");
  }
  if (ruleId === "sast.weak-tls") {
    return line.replace("rejectUnauthorized: false", "rejectUnauthorized: true");
  }
  if (ruleId === "api.weak-hash") {
    return line.replaceAll(/['"]md5['"]/g, '"sha256"').replaceAll(/['"]sha1['"]/g, '"sha256"');
  }
  if (ruleId === "api.insecure-random") {
    return line.replaceAll(/\bMath\.random\s*\(\s*\)/g, "crypto.randomUUID()");
  }
  if (ruleId === "api.cleartext-http") {
    return line.replaceAll(/http:\/\//g, "https://");
  }
  if (ruleId === "api.legacy-buffer") {
    return line.replaceAll(/\bnew\s+Buffer\s*\(/g, "Buffer.from(");
  }
  if (ruleId === "api.legacy-cipher") {
    return line.replaceAll(/\bcreateCipher\s*\(/g, "createCipheriv(");
  }
  if (ruleId === "api.cors-any") {
    return line.replaceAll(/origin\s*:\s*['"]\*['"]/g, "origin: false");
  }
  if (ruleId === "api.cookie-flags") {
    return line.replaceAll(/httpOnly\s*:\s*false/g, "httpOnly: true");
  }
  if (ruleId === "api.shell-true") {
    return line.replaceAll(/shell\s*:\s*true/g, "shell: false");
  }
  if (ruleId === "auth.jwt-decode") {
    return line.replaceAll(/\bjwt\.decode\s*\(/g, "jwt.verify(");
  }
  if (ruleId === "secret.hardcoded") {
    return line.replace(
      /(\b(?:password|passwd|secret|api[_-]?key|access[_-]?token)\b\s*[:=]\s*)(['"`])[^'"`]+\2/i,
      "$1process.env.SECRET",
    );
  }
  return line;
}

const DEPENDENCY_SECTIONS = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function detectIndent(text: string): string | number {
  const match = /\n([ \t]+)"/.exec(text);
  if (match?.[1] !== undefined) {
    return match[1];
  }
  if (!text.includes("\n")) {
    return 0;
  }
  return 2;
}

function serializeJson(value: unknown, original: string): string {
  const serialized = JSON.stringify(value, null, detectIndent(original));
  return original.endsWith("\n") ? `${serialized}\n` : serialized;
}

function rangeOperator(declared: string): string {
  if (declared.startsWith("^") || declared.startsWith("~")) {
    return declared.slice(0, 1);
  }
  return "";
}

function packageJsonPath(findingPath: string, files: Map<string, string>): string | undefined {
  if (findingPath.endsWith("package.json") && files.has(findingPath)) {
    return findingPath;
  }
  const slash = findingPath.lastIndexOf("/");
  const sibling = `${slash === -1 ? "" : findingPath.slice(0, slash + 1)}package.json`;
  if (files.has(sibling)) {
    return sibling;
  }
  return undefined;
}

function declaredDependency(
  manifest: Record<string, unknown>,
  packageName: string,
): { section: (typeof DEPENDENCY_SECTIONS)[number]; range: string } | undefined {
  for (const section of DEPENDENCY_SECTIONS) {
    const block = manifest[section];
    if (!isRecord(block) || typeof block[packageName] !== "string") {
      continue;
    }
    return { section, range: block[packageName] };
  }
  return undefined;
}

function dependencyAdvice(finding: VulnerabilityFinding): string {
  const name = finding.packageName ?? "dependency";
  const version = finding.packageVersion ?? "unknown";
  const label = finding.cve ?? finding.ruleId;
  if (finding.patchedVersion === undefined) {
    return `Upgrade ${name}@${version} manually; no fixed version is known for ${label}`;
  }
  return `Upgrade transitive ${name}@${version} to ${finding.patchedVersion} (${label}); package is lockfile-only`;
}

function bumpDependency(
  finding: VulnerabilityFinding,
  files: Map<string, string>,
): SuggestionChange | undefined {
  if (
    finding.packageName === undefined ||
    finding.packageVersion === undefined ||
    finding.patchedVersion === undefined
  ) {
    return undefined;
  }
  const path = packageJsonPath(finding.path, files);
  if (path === undefined) {
    return undefined;
  }
  const current = files.get(path);
  if (current === undefined) {
    return undefined;
  }
  let manifest: unknown;
  try {
    manifest = JSON.parse(current) as unknown;
  } catch {
    return undefined;
  }
  if (!isRecord(manifest)) {
    return undefined;
  }
  const declared = declaredDependency(manifest, finding.packageName);
  if (declared === undefined) {
    return undefined;
  }
  const nextRange = `${rangeOperator(declared.range)}${finding.patchedVersion}`;
  const block = manifest[declared.section];
  if (!isRecord(block) || nextRange === declared.range) {
    return undefined;
  }
  block[finding.packageName] = nextRange;
  const next = serializeJson(manifest, current);
  if (next === current) {
    return undefined;
  }
  const label = finding.cve ?? finding.ruleId;
  return {
    path,
    oldText: current,
    newText: next,
    description: `Bump ${finding.packageName} from ${declared.range} to ${nextRange} (${label})`,
  };
}

export function remediateFinding(
  finding: VulnerabilityFinding,
  files: Map<string, string>,
): SuggestionChange | undefined {
  if (finding.category === "dependency") {
    return bumpDependency(finding, files);
  }
  const current = files.get(finding.path);
  if (current === undefined) {
    return undefined;
  }
  const next = current
    .split("\n")
    .map((line) => rewriteLine(finding.ruleId, line))
    .filter((line): line is string => line !== undefined)
    .join("\n");
  if (next === current) {
    return undefined;
  }
  return {
    path: finding.path,
    oldText: current,
    newText: next.endsWith("\n") || current.endsWith("\n") === false ? next : `${next}\n`,
    description: `Apply local fix for ${finding.ruleId}`,
  };
}

function suggestionFromChange(
  finding: VulnerabilityFinding,
  change: SuggestionChange,
): Suggestion | undefined {
  const patch = unifiedDiff(change.path, change.oldText, change.newText);
  if (patch.length === 0) {
    return undefined;
  }
  return {
    id: `remediate:${finding.id}`,
    title: `Remediate ${finding.ruleId}`,
    kind: "single-file",
    findingId: finding.id,
    changes: [change],
    patch,
    impactPaths: [change.path],
    validation: { ok: true, problems: [] },
  };
}

export function suggestRemediations(
  findings: readonly VulnerabilityFinding[],
  files: Map<string, string>,
): Suggestion[] {
  const suggestions: Suggestion[] = [];
  for (const finding of findings) {
    const change = remediateFinding(finding, files);
    if (change !== undefined) {
      const suggestion = suggestionFromChange(finding, change);
      if (suggestion !== undefined) {
        suggestions.push(suggestion);
      }
      continue;
    }
    if (finding.category !== "dependency" || finding.packageName === undefined) {
      continue;
    }
    suggestions.push({
      id: `remediate:${finding.id}`,
      title: dependencyAdvice(finding),
      kind: "single-file",
      findingId: finding.id,
      changes: [],
      patch: "",
      impactPaths: [finding.path],
      validation: { ok: true, problems: [] },
    });
  }
  return suggestions;
}

export function combineRemediationPatches(suggestions: readonly Suggestion[]): string {
  return combinePatches(suggestions.map((suggestion) => suggestion.patch));
}
