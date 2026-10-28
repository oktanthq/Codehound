import type { CodeIntelligenceModel } from "./model.js";
import type { RelationKind } from "./ontology.js";
import type { CimEntity, CimRelation } from "./types.js";

export type CimGraph = {
  kind: RelationKind;
  nodes: CimEntity[];
  edges: CimRelation[];
};

export type NamedEdge = {
  from: string;
  to: string;
  fromKind: string;
  toKind: string;
};

export function graphOf(model: CodeIntelligenceModel, kind: RelationKind): CimGraph {
  const edges = model.listRelations().filter((relation) => relation.kind === kind);
  const ids = new Set<string>();
  for (const edge of edges) {
    ids.add(edge.fromId);
    ids.add(edge.toId);
  }
  const nodes = model.listEntities().filter((entity) => ids.has(entity.id));
  return { kind, nodes, edges };
}

export function namedEdges(graph: CimGraph): NamedEdge[] {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  return graph.edges.flatMap((edge) => {
    const from = byId.get(edge.fromId);
    const to = byId.get(edge.toId);
    if (from === undefined || to === undefined) {
      return [];
    }
    return [
      {
        from: from.name,
        to: to.name,
        fromKind: from.kind,
        toKind: to.kind,
      },
    ];
  });
}

export function edgesOfKind(
  model: CodeIntelligenceModel,
  relationKind: RelationKind,
  fromKind: string,
  toKind: string,
): NamedEdge[] {
  return namedEdges(graphOf(model, relationKind)).filter(
    (edge) => edge.fromKind === fromKind && edge.toKind === toKind,
  );
}

export function fileDependencyGraph(model: CodeIntelligenceModel): NamedEdge[] {
  return edgesOfKind(model, "depends-on", "file", "file");
}

export function callGraphEdges(model: CodeIntelligenceModel): NamedEdge[] {
  return namedEdges(graphOf(model, "calls"));
}

export function componentDependencyGraph(model: CodeIntelligenceModel): NamedEdge[] {
  return edgesOfKind(model, "depends-on", "component", "component");
}

export function architectureGraph(model: CodeIntelligenceModel): NamedEdge[] {
  return edgesOfKind(model, "depends-on", "layer", "layer");
}

export function dataFlowGraphEdges(model: CodeIntelligenceModel): NamedEdge[] {
  return namedEdges(graphOf(model, "flows-to"));
}
