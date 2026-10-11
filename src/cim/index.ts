export { ingestAnalysisRun } from "./from-analysis.js";
export { CodeIntelligenceModel, entityId, relationId } from "./model.js";
export { ENTITY_KINDS, RELATION_KINDS, isEntityKind, isRelationKind } from "./ontology.js";
export { CimQueryLayer } from "./query.js";
export { InMemoryCimStore, persistModel } from "./store.js";

export type { EntityKind, RelationKind } from "./ontology.js";
export type { CimAttribute, CimEntity, CimQuery, CimRelation, CimSnapshot } from "./types.js";
export type { CimStore } from "./store.js";
