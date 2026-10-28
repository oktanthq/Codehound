export const ENTITY_KINDS = [
  "project",
  "repository",
  "file",
  "module",
  "symbol",
  "component",
  "endpoint",
  "type",
  "layer",
  "rule",
] as const;

export const RELATION_KINDS = [
  "contains",
  "imports",
  "depends-on",
  "calls",
  "extends",
  "implements",
  "aliases",
  "exposes",
  "flows-to",
  "governs",
] as const;

export type EntityKind = (typeof ENTITY_KINDS)[number];
export type RelationKind = (typeof RELATION_KINDS)[number];

export const ENTITY_KIND_SET: ReadonlySet<string> = new Set(ENTITY_KINDS);
export const RELATION_KIND_SET: ReadonlySet<string> = new Set(RELATION_KINDS);

export function isEntityKind(value: string): value is EntityKind {
  return ENTITY_KIND_SET.has(value);
}

export function isRelationKind(value: string): value is RelationKind {
  return RELATION_KIND_SET.has(value);
}
