import {
  architectureGraph,
  callGraphEdges,
  componentDependencyGraph,
  dataFlowGraphEdges,
  fileDependencyGraph,
  graphOf,
  type CimGraph,
  type NamedEdge,
} from "./graphs.js";
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

  graph(kind: RelationKind): CimGraph {
    return graphOf(this.model, kind);
  }

  byKind(kind: EntityKind): CimEntity[] {
    return this.entities({ kind });
  }

  dependencyGraph(): CimGraph {
    return this.graph("depends-on");
  }

  fileDependencies(): NamedEdge[] {
    return fileDependencyGraph(this.model);
  }

  callGraph(): CimGraph {
    return this.graph("calls");
  }

  calls(): NamedEdge[] {
    return callGraphEdges(this.model);
  }

  componentDependencies(): NamedEdge[] {
    return componentDependencyGraph(this.model);
  }

  layerDependencies(): NamedEdge[] {
    return architectureGraph(this.model);
  }

  dataFlowGraph(): CimGraph {
    return this.graph("flows-to");
  }

  dataFlows(): NamedEdge[] {
    return dataFlowGraphEdges(this.model);
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
