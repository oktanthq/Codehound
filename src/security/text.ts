export type SourceLine = {
  line: number;
  text: string;
};

export function sourceLines(content: string): SourceLine[] {
  return content.split(/\r?\n/).map((text, index) => ({ line: index + 1, text }));
}

export function isCodeComment(text: string): boolean {
  return /^\s*(\/\/|\/\*|\*(?!\/)|#|<!--)/.test(text);
}

export function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith("`") && trimmed.endsWith("`"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}
