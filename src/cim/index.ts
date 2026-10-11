export { ingestAnalysisRun, layerForPath } from "./from-analysis.js";
export {
  architectureGraph,
  callGraphEdges,
  componentDependencyGraph,
  dataFlowGraphEdges,
  fileDependencyGraph,
  graphOf,
  namedEdges,
} from "./graphs.js";
export { CodeIntelligenceModel, entityId, relationId } from "./model.js";
export { ENTITY_KINDS, RELATION_KINDS, isEntityKind, isRelationKind } from "./ontology.js";
export { CimQueryLayer } from "./query.js";
export { isRuleName } from "./rules.js";
export { InMemoryCimStore, persistModel } from "./store.js";

export type { EntityKind, RelationKind } from "./ontology.js";
export type { CimGraph, NamedEdge } from "./graphs.js";
export type { CimAttribute, CimEntity, CimQuery, CimRelation, CimSnapshot } from "./types.js";
export type { CimStore } from "./store.js";
