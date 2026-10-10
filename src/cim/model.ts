import type { EntityKind, RelationKind } from "./ontology.js";
import type { CimEntity, CimQuery, CimRelation, CimSnapshot } from "./types.js";

export function entityId(kind: EntityKind, repositoryFullName: string, key: string): string {
  return `${kind}:${repositoryFullName.toLowerCase()}:${key}`;
}

export function relationId(kind: RelationKind, fromId: string, toId: string): string {
  return `${kind}:${fromId}->${toId}`;
}

export class CodeIntelligenceModel {
  private readonly entities = new Map<string, CimEntity>();
  private readonly relations = new Map<string, CimRelation>();
  private version = 1;

  upsertEntity(entity: CimEntity): CimEntity {
    this.entities.set(entity.id, entity);
    return entity;
  }

  upsertRelation(relation: CimRelation): CimRelation {
    this.relations.set(relation.id, relation);
    return relation;
  }

  getEntity(id: string): CimEntity | undefined {
    return this.entities.get(id);
  }

  getRelation(id: string): CimRelation | undefined {
    return this.relations.get(id);
  }

  listEntities(): CimEntity[] {
    return [...this.entities.values()];
  }

  listRelations(): CimRelation[] {
    return [...this.relations.values()];
  }

  neighbors(id: string, kind: RelationKind | undefined = undefined): CimRelation[] {
    return this.listRelations().filter(
      (relation) =>
        (relation.fromId === id || relation.toId === id) &&
        (kind === undefined || relation.kind === kind),
    );
  }

  query(query: CimQuery): CimEntity[] {
    return this.listEntities().filter((entity) => {
      if (query.kind !== undefined && entity.kind !== query.kind) {
        return false;
      }
      if (query.name !== undefined && entity.name !== query.name) {
        return false;
      }
      if (
        query.pathPrefix !== undefined &&
        (entity.path === undefined || !entity.path.startsWith(query.pathPrefix))
      ) {
        return false;
      }
      if (
        query.repositoryFullName !== undefined &&
        entity.repositoryFullName.toLowerCase() !== query.repositoryFullName.toLowerCase()
      ) {
        return false;
      }
      if (query.commitSha !== undefined && entity.commitSha !== query.commitSha) {
        return false;
      }
      return true;
    });
  }

  removeByPath(path: string): { entities: number; relations: number } {
    const removedIds = new Set<string>();
    for (const [id, entity] of this.entities) {
      if (entity.path === path) {
        this.entities.delete(id);
        removedIds.add(id);
      }
    }
    let relations = 0;
    for (const [id, relation] of this.relations) {
      if (removedIds.has(relation.fromId) || removedIds.has(relation.toId)) {
        this.relations.delete(id);
        relations += 1;
      }
    }
    return { entities: removedIds.size, relations };
  }

  snapshot(repositoryFullName: string, commitSha: string, createdAt: string): CimSnapshot {
    return {
      version: this.version,
      repositoryFullName,
      commitSha,
      createdAt,
      entities: this.listEntities(),
      relations: this.listRelations(),
    };
  }

  bumpVersion(): number {
    this.version += 1;
    return this.version;
  }

  currentVersion(): number {
    return this.version;
  }

  loadSnapshot(snapshot: CimSnapshot): void {
    this.entities.clear();
    this.relations.clear();
    for (const entity of snapshot.entities) {
      this.entities.set(entity.id, entity);
    }
    for (const relation of snapshot.relations) {
      this.relations.set(relation.id, relation);
    }
    this.version = snapshot.version;
  }
}
