export function asObject(value: unknown): Record<string, unknown> {
  if (value === undefined || value === null) {
    return {};
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Tool arguments must be an object");
  }
  return value as Record<string, unknown>;
}

export function optionalString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(`${key} must be a string`);
  }
  return value;
}

export function requiredString(args: Record<string, unknown>, key: string): string {
  const value = optionalString(args, key);
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`${key} is required`);
  }
  return value;
}

export function optionalInteger(
  args: Record<string, unknown>,
  key: string,
  fallback: number,
): number {
  const value = args[key];
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error(`${key} must be a positive integer`);
  }
  return value;
}
