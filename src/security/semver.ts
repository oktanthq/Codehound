export type Semver = {
  major: number;
  minor: number;
  patch: number;
};

export function parseSemver(version: string): Semver | undefined {
  const match = version
    .trim()
    .replace(/^[vV]/, "")
    .replace(/^[~^>=<]+\s*/, "")
    .match(/^(\d+)\.(\d+)\.(\d+)/);
  if (match === null || match[1] === undefined || match[2] === undefined || match[3] === undefined) {
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

function compareOp(version: Semver, op: string, bound: Semver): boolean {
  const cmp = compareSemver(version, bound);
  switch (op) {
    case "<":
      return cmp < 0;
    case "<=":
      return cmp <= 0;
    case ">":
      return cmp > 0;
    case ">=":
      return cmp >= 0;
    case "=":
    case "==":
      return cmp === 0;
    default:
      return false;
  }
}

export function versionSatisfies(version: string, range: string): boolean {
  const parsed = parseSemver(version);
  if (parsed === undefined) {
    return false;
  }
  const hyphen = range.match(/^(\d+\.\d+\.\d+)\s*-\s*(\d+\.\d+\.\d+)$/);
  if (hyphen !== null && hyphen[1] !== undefined && hyphen[2] !== undefined) {
    const low = parseSemver(hyphen[1]);
    const high = parseSemver(hyphen[2]);
    if (low === undefined || high === undefined) {
      return false;
    }
    return compareSemver(parsed, low) >= 0 && compareSemver(parsed, high) <= 0;
  }
  const parts = range.trim().split(/\s+/).filter((part) => part.length > 0);
  if (parts.length === 0) {
    return false;
  }
  return parts.every((part) => {
    const match = part.match(/^(<=|<|>=|>|==|=)?\s*(\d+\.\d+\.\d+)/);
    if (match === null || match[2] === undefined) {
      return false;
    }
    const bound = parseSemver(match[2]);
    if (bound === undefined) {
      return false;
    }
    return compareOp(parsed, match[1] ?? "=", bound);
  });
}
