export function splitIdentifier(token: string): string[] {
  const parts = token
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[\s_]+/);
  return parts.map((part) => part.toLowerCase()).filter((part) => part.length > 0);
}

export function tokenize(text: string): string[] {
  const raw = text.split(/[^A-Za-z0-9_]+/).filter((part) => part.length > 0);
  const tokens: string[] = [];
  for (const part of raw) {
    const pieces = splitIdentifier(part);
    tokens.push(part.toLowerCase(), ...pieces);
  }
  return tokens;
}

export function hashToken(token: string): number {
  let hash = 2166136261;
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
