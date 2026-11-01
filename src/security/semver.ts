export type Semver = {
  major: number;
  minor: number;
  patch: number;
};

type Identifier = string | number;

type ParsedVersion = Semver & {
  prerelease: Identifier[];
};

type ComparatorOp = "<" | "<=" | ">" | ">=" | "=";

type Comparator = { any: true } | { any: false; op: ComparatorOp; version: ParsedVersion };

const NUMERIC = "0|[1-9]\\d*";
const NON_NUMERIC = `\\d*[a-zA-Z-][a-zA-Z0-9-]*`;
const PRERELEASE_ID = `(?:${NON_NUMERIC}|${NUMERIC})`;
const PRERELEASE = `(?:-(${PRERELEASE_ID}(?:\\.${PRERELEASE_ID})*))`;
const BUILD = `(?:\\+[a-zA-Z0-9-]+(?:\\.[a-zA-Z0-9-]+)*)`;
const MAIN = `(${NUMERIC})\\.(${NUMERIC})\\.(${NUMERIC})`;
const FULL = new RegExp(`^v?${MAIN}${PRERELEASE}?${BUILD}?$`);
const X_ID = `${NUMERIC}|x|X|\\*`;
const XRANGE_PLAIN =
  `[v=\\s]*(${X_ID})` + `(?:\\.(${X_ID})` + `(?:\\.(${X_ID})` + `(?:${PRERELEASE})?${BUILD}?)?)?`;
const GTLT = "((?:<|>)?=?)";
const HYPHEN_RANGE = new RegExp(`^\\s*(${XRANGE_PLAIN})\\s+-\\s+(${XRANGE_PLAIN})\\s*$`);
const TILDE = new RegExp(`^~>?${XRANGE_PLAIN}$`);
const CARET = new RegExp(`^\\^${XRANGE_PLAIN}$`);
const XRANGE = new RegExp(`^${GTLT}\\s*${XRANGE_PLAIN}$`);
const COMPARATOR = new RegExp(`^${GTLT}\\s*v?${MAIN}${PRERELEASE}?${BUILD}?$`);
const TILDE_TRIM = /(\s*)(?:~>?)\s+/g;
const CARET_TRIM = /(\s*)\^\s+/g;
const STAR = /^(<|>)?=?\s*\*$/;
const BUILD_GLOBAL = new RegExp(BUILD, "g");

export function parseSemver(version: string): Semver | undefined {
  const match = version
    .trim()
    .replace(/^[vV]/, "")
    .replace(/^[~^>=<]+\s*/, "")
    .match(/^(\d+)\.(\d+)\.(\d+)/);
  if (
    match === null ||
    match[1] === undefined ||
    match[2] === undefined ||
    match[3] === undefined
  ) {
    return undefined;
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

export function compareSemver(left: Semver, right: Semver): number {
  return left.major - right.major || left.minor - right.minor || left.patch - right.patch;
}

function parseIdentifiers(raw: string | undefined): Identifier[] {
  if (raw === undefined || raw.length === 0) {
    return [];
  }
  return raw.split(".").map((part) => (/^(0|[1-9]\d*)$/.test(part) ? Number(part) : part));
}

function parseFullVersion(version: string): ParsedVersion | undefined {
  const match = version.trim().match(FULL);
  if (
    match === null ||
    match[1] === undefined ||
    match[2] === undefined ||
    match[3] === undefined
  ) {
    return undefined;
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: parseIdentifiers(match[4]),
  };
}

function compareIdentifiers(left: Identifier, right: Identifier): number {
  const leftNumeric = typeof left === "number";
  const rightNumeric = typeof right === "number";
  if (leftNumeric && rightNumeric) {
    return left - right;
  }
  if (leftNumeric) {
    return -1;
  }
  if (rightNumeric) {
    return 1;
  }
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareVersions(left: ParsedVersion, right: ParsedVersion): number {
  const core = compareSemver(left, right);
  if (core !== 0) {
    return core;
  }
  if (left.prerelease.length === 0 && right.prerelease.length === 0) {
    return 0;
  }
  if (left.prerelease.length === 0) {
    return 1;
  }
  if (right.prerelease.length === 0) {
    return -1;
  }
  const length = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const leftId = left.prerelease[index];
    const rightId = right.prerelease[index];
    if (leftId === undefined) {
      return -1;
    }
    if (rightId === undefined) {
      return 1;
    }
    const cmp = compareIdentifiers(leftId, rightId);
    if (cmp !== 0) {
      return cmp;
    }
  }
  return 0;
}

function isX(value: string | undefined): boolean {
  return value === undefined || value.length === 0 || value === "*" || value.toLowerCase() === "x";
}

function invalidXRangeOrder(
  major: string | undefined,
  minor: string | undefined,
  patch: string | undefined,
): boolean {
  return (isX(major) && !isX(minor)) || (isX(minor) && patch !== undefined && !isX(patch));
}

function hyphenReplace(
  _all: string,
  from: string,
  fromMajor: string | undefined,
  fromMinor: string | undefined,
  fromPatch: string | undefined,
  _fromPre: string | undefined,
  to: string,
  toMajor: string | undefined,
  toMinor: string | undefined,
  toPatch: string | undefined,
  toPre: string | undefined,
): string {
  const lower = hyphenLower(from, fromMajor, fromMinor, fromPatch);
  const upper = hyphenUpper(to, toMajor, toMinor, toPatch, toPre);
  return `${lower} ${upper}`.trim();
}

function hyphenLower(
  from: string,
  fromMajor: string | undefined,
  fromMinor: string | undefined,
  fromPatch: string | undefined,
): string {
  if (isX(fromMajor)) {
    return "";
  }
  if (isX(fromMinor)) {
    return `>=${fromMajor}.0.0`;
  }
  if (isX(fromPatch)) {
    return `>=${fromMajor}.${fromMinor}.0`;
  }
  return `>=${from}`;
}

function hyphenUpper(
  to: string,
  toMajor: string | undefined,
  toMinor: string | undefined,
  toPatch: string | undefined,
  toPre: string | undefined,
): string {
  if (isX(toMajor) || toMajor === undefined) {
    return "";
  }
  if (isX(toMinor)) {
    return `<${Number(toMajor) + 1}.0.0-0`;
  }
  if (isX(toPatch)) {
    return `<${toMajor}.${Number(toMinor) + 1}.0-0`;
  }
  if (toPre !== undefined) {
    return `<=${toMajor}.${toMinor}.${toPatch}-${toPre}`;
  }
  return `<=${to}`;
}

function replaceTilde(
  _all: string,
  major: string | undefined,
  minor: string | undefined,
  patch: string | undefined,
  pre: string | undefined,
): string {
  if (isX(major) || major === undefined) {
    return "";
  }
  if (isX(minor)) {
    return `>=${major}.0.0 <${Number(major) + 1}.0.0-0`;
  }
  if (isX(patch)) {
    return `>=${major}.${minor}.0 <${major}.${Number(minor) + 1}.0-0`;
  }
  if (pre !== undefined) {
    return `>=${major}.${minor}.${patch}-${pre} <${major}.${Number(minor) + 1}.0-0`;
  }
  return `>=${major}.${minor}.${patch} <${major}.${Number(minor) + 1}.0-0`;
}

function replaceCaret(
  _all: string,
  major: string | undefined,
  minor: string | undefined,
  patch: string | undefined,
  pre: string | undefined,
): string {
  if (isX(major) || major === undefined) {
    return "";
  }
  if (isX(minor)) {
    return `>=${major}.0.0 <${Number(major) + 1}.0.0-0`;
  }
  if (isX(patch)) {
    if (major === "0") {
      return `>=${major}.${minor}.0 <${major}.${Number(minor) + 1}.0-0`;
    }
    return `>=${major}.${minor}.0 <${Number(major) + 1}.0.0-0`;
  }
  if (pre !== undefined) {
    if (major === "0") {
      if (minor === "0") {
        return `>=${major}.${minor}.${patch}-${pre} <${major}.${minor}.${Number(patch) + 1}-0`;
      }
      return `>=${major}.${minor}.${patch}-${pre} <${major}.${Number(minor) + 1}.0-0`;
    }
    return `>=${major}.${minor}.${patch}-${pre} <${Number(major) + 1}.0.0-0`;
  }
  if (major === "0") {
    if (minor === "0") {
      return `>=${major}.${minor}.${patch} <${major}.${minor}.${Number(patch) + 1}-0`;
    }
    return `>=${major}.${minor}.${patch} <${major}.${Number(minor) + 1}.0-0`;
  }
  return `>=${major}.${minor}.${patch} <${Number(major) + 1}.0.0-0`;
}

function replaceXRange(
  all: string,
  gtlt: string,
  major: string | undefined,
  minor: string | undefined,
  patch: string | undefined,
): string {
  if (invalidXRangeOrder(major, minor, patch)) {
    return all;
  }
  let operator = gtlt;
  const majorIsX = isX(major);
  const minorIsX = majorIsX || isX(minor);
  const patchIsX = minorIsX || isX(patch);
  if (operator === "=" && patchIsX) {
    operator = "";
  }
  if (majorIsX) {
    return operator === ">" || operator === "<" ? "<0.0.0-0" : "*";
  }
  if (operator.length > 0 && patchIsX) {
    let nextMajor = Number(major);
    let nextMinor = minorIsX ? 0 : Number(minor);
    const nextPatch = 0;
    if (operator === ">") {
      operator = ">=";
      if (minorIsX) {
        nextMajor += 1;
        nextMinor = 0;
      } else {
        nextMinor += 1;
      }
    } else if (operator === "<=") {
      operator = "<";
      if (minorIsX) {
        nextMajor += 1;
      } else {
        nextMinor += 1;
      }
    }
    const pre = operator === "<" ? "-0" : "";
    return `${operator}${nextMajor}.${nextMinor}.${nextPatch}${pre}`;
  }
  if (minorIsX) {
    return `>=${major}.0.0 <${Number(major) + 1}.0.0-0`;
  }
  if (patchIsX) {
    return `>=${major}.${minor}.0 <${major}.${Number(minor) + 1}.0-0`;
  }
  return all;
}

function expandSimple(comp: string): string {
  const withoutBuild = comp.replace(BUILD_GLOBAL, "");
  const caret = withoutBuild.replace(CARET, replaceCaret);
  const tilde = caret.replace(TILDE, replaceTilde);
  const xrange = tilde.replace(XRANGE, replaceXRange);
  return xrange.replace(STAR, "").trim();
}

function parseComparator(token: string): Comparator | undefined {
  if (token.length === 0 || token === "*") {
    return { any: true };
  }
  const match = token.match(COMPARATOR);
  if (
    match === null ||
    match[2] === undefined ||
    match[3] === undefined ||
    match[4] === undefined
  ) {
    return undefined;
  }
  const opRaw = match[1];
  const op: ComparatorOp =
    opRaw === "<" || opRaw === "<=" || opRaw === ">" || opRaw === ">=" ? opRaw : "=";
  return {
    any: false,
    op,
    version: {
      major: Number(match[2]),
      minor: Number(match[3]),
      patch: Number(match[4]),
      prerelease: parseIdentifiers(match[5]),
    },
  };
}

function parseRange(range: string): Comparator[] | undefined {
  let normalized = range.replace(BUILD_GLOBAL, "");
  normalized = normalized.replace(HYPHEN_RANGE, hyphenReplace);
  normalized = normalized.replace(/(<=|>=|<|>|=)\s+/g, "$1");
  normalized = normalized.replace(TILDE_TRIM, "$1~");
  normalized = normalized.replace(CARET_TRIM, "$1^");
  const tokens = normalized
    .split(" ")
    .map((token) => expandSimple(token))
    .join(" ")
    .split(/\s+/)
    .map((token) => (token === ">=0.0.0" ? "" : token));
  const comparators: Comparator[] = [];
  let hasConcrete = false;
  for (const token of tokens) {
    const comparator = parseComparator(token);
    if (comparator === undefined) {
      return undefined;
    }
    if (comparator.any) {
      continue;
    }
    hasConcrete = true;
    comparators.push(comparator);
  }
  if (!hasConcrete) {
    return [{ any: true }];
  }
  return comparators;
}

function testComparator(version: ParsedVersion, comparator: Comparator): boolean {
  if (comparator.any) {
    return true;
  }
  const cmp = compareVersions(version, comparator.version);
  switch (comparator.op) {
    case "<":
      return cmp < 0;
    case "<=":
      return cmp <= 0;
    case ">":
      return cmp > 0;
    case ">=":
      return cmp >= 0;
    case "=":
      return cmp === 0;
  }
}

function testSet(version: ParsedVersion, set: readonly Comparator[]): boolean {
  if (!set.every((comparator) => testComparator(version, comparator))) {
    return false;
  }
  if (version.prerelease.length === 0) {
    return true;
  }
  return set.some(
    (comparator) =>
      !comparator.any &&
      comparator.version.prerelease.length > 0 &&
      comparator.version.major === version.major &&
      comparator.version.minor === version.minor &&
      comparator.version.patch === version.patch,
  );
}

function parseRangeSets(range: string): Comparator[][] | undefined {
  const raw = range.trim().replace(/\s+/g, " ");
  if (raw.length === 0) {
    return [[{ any: true }]];
  }
  const unions = raw
    .split("||")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (unions.length === 0) {
    return undefined;
  }
  const sets: Comparator[][] = [];
  for (const union of unions) {
    const set = parseRange(union);
    if (set === undefined) {
      return undefined;
    }
    sets.push(set);
  }
  return sets;
}

export function versionSatisfies(version: string, range: string): boolean {
  const parsed = parseFullVersion(version);
  if (parsed === undefined) {
    return false;
  }
  const sets = parseRangeSets(range);
  if (sets === undefined) {
    return false;
  }
  return sets.some((set) => testSet(parsed, set));
}
