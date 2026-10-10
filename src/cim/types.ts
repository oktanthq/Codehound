import type { EntityKind, RelationKind } from "./ontology.js";

export type CimAttribute = string | number | boolean | undefined;

export type CimEntity = {
  id: string;
  kind: EntityKind;
  name: string;
  path: string | undefined;
  repositoryFullName: string;
  commitSha: string;
  attributes: Record<string, CimAttribute>;
};

export type CimRelation = {
  id: string;
  kind: RelationKind;
  fromId: string;
  toId: string;
};

export type CimSnapshot = {
  version: number;
  repositoryFullName: string;
  commitSha: string;
  createdAt: string;
  entities: CimEntity[];
  relations: CimRelation[];
};

export type CimQuery = {
  kind?: EntityKind;
  name?: string;
  pathPrefix?: string;
  repositoryFullName?: string;
  commitSha?: string;
};
