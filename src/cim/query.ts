import type { CodeIntelligenceModel } from "./model.js";
import type { EntityKind, RelationKind } from "./ontology.js";
import type { CimEntity, CimQuery, CimRelation } from "./types.js";

export class CimQueryLayer {
  constructor(private readonly model: CodeIntelligenceModel) {}

  entities(query: CimQuery = {}): CimEntity[] {
    return this.model.query(query);
  }

  relations(kind: RelationKind | undefined = undefined): CimRelation[] {
    const relations = this.model.listRelations();
    if (kind === undefined) {
      return relations;
    }
    return relations.filter((relation) => relation.kind === kind);
  }

  graph(kind: RelationKind): { nodes: CimEntity[]; edges: CimRelation[] } {
    const edges = this.relations(kind);
    const ids = new Set<string>();
    for (const edge of edges) {
      ids.add(edge.fromId);
      ids.add(edge.toId);
    }
    const nodes = this.model.listEntities().filter((entity) => ids.has(entity.id));
    return { nodes, edges };
  }

  byKind(kind: EntityKind): CimEntity[] {
    return this.entities({ kind });
  }

  dependencyGraph(): { nodes: CimEntity[]; edges: CimRelation[] } {
    return this.graph("depends-on");
  }

  callGraph(): { nodes: CimEntity[]; edges: CimRelation[] } {
    return this.graph("calls");
  }

  dataFlowGraph(): { nodes: CimEntity[]; edges: CimRelation[] } {
    return this.graph("flows-to");
  }

  architectureLayers(): CimEntity[] {
    return this.byKind("layer");
  }

  components(): CimEntity[] {
    return this.byKind("component");
  }

  rules(): CimEntity[] {
    return this.byKind("rule");
  }

  ruleBindings(): { nodes: CimEntity[]; edges: CimRelation[] } {
    return this.graph("governs");
  }
}
