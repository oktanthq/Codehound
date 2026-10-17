import type { CimQueryLayer } from "../cim/query.js";
import type { NamedEdge } from "../cim/graphs.js";
import type { AnalyzedFileDiff } from "./types.js";

export type PullImpact = {
  path: string;
  dependents: NamedEdge[];
  dependencies: NamedEdge[];
  layers: string[];
  rules: string[];
};

export function analyzePullImpact(
  query: CimQueryLayer,
  diffs: readonly AnalyzedFileDiff[],
): PullImpact[] {
  return diffs.map((diff) => {
    const dependents = query.fileDependencies().filter((edge) => edge.to === diff.path);
    const dependencies = query.fileDependencies().filter((edge) => edge.from === diff.path);
    const file = query.byKind("file").find((entity) => entity.path === diff.path);
    const layers = query
      .architectureLayers()
      .filter((layer) =>
        query
          .relations("contains")
          .some((relation) => relation.fromId === layer.id && relation.toId === file?.id),
      )
      .map((layer) => layer.name);
    const rules = query
      .rules()
      .filter((rule) => rule.path === diff.path)
      .map((rule) => rule.name);
    return {
      path: diff.path,
      dependents,
      dependencies,
      layers,
      rules,
    };
  });
}
