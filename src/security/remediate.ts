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

function bumpDependency(
  finding: VulnerabilityFinding,
  files: Map<string, string>,
): SuggestionChange | undefined {
  if (finding.packageName === undefined || finding.packageVersion === undefined) {
    return undefined;
  }
  const path = finding.path;
  const current = files.get(path);
  if (current === undefined) {
    return undefined;
  }
  const next = current.replaceAll(
    `"${finding.packageName}": "${finding.packageVersion}"`,
    `"${finding.packageName}": "${finding.packageVersion}" /* upgrade past ${finding.cve ?? finding.ruleId} */`,
  );
  if (next === current) {
    return undefined;
  }
  return {
    path,
    oldText: current,
    newText: next,
    description: `Mark ${finding.packageName}@${finding.packageVersion} for upgrade`,
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

export function suggestRemediations(
  findings: readonly VulnerabilityFinding[],
  files: Map<string, string>,
): Suggestion[] {
  const suggestions: Suggestion[] = [];
  for (const finding of findings) {
    const change = remediateFinding(finding, files);
    if (change === undefined) {
      continue;
    }
    const patch = unifiedDiff(change.path, change.oldText, change.newText);
    if (patch.length === 0) {
      continue;
    }
    suggestions.push({
      id: `remediate:${finding.id}`,
      title: `Remediate ${finding.ruleId}`,
      kind: "single-file",
      findingId: finding.id,
      changes: [change],
      patch,
      impactPaths: [change.path],
      validation: { ok: true, problems: [] },
    });
  }
  return suggestions;
}

export function combineRemediationPatches(suggestions: readonly Suggestion[]): string {
  return combinePatches(suggestions.map((suggestion) => suggestion.patch));
}
