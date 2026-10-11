import type { AnalysisDocument, AnalysisRun } from "../analysis/types.js";
import { entityId, relationId, type CodeIntelligenceModel } from "./model.js";
import { isRuleName } from "./rules.js";
import type { CimEntity } from "./types.js";

function contextOf(run: AnalysisRun): { repositoryFullName: string; commitSha: string } {
  return {
    repositoryFullName: run.context.repositoryFullName,
    commitSha: run.context.commitSha,
  };
}

function fileEntity(
  document: AnalysisDocument,
  repositoryFullName: string,
  commitSha: string,
): CimEntity {
  return {
    id: entityId("file", repositoryFullName, document.path),
    kind: "file",
    name: document.path,
    path: document.path,
    repositoryFullName,
    commitSha,
    attributes: { language: document.language, adapterId: document.adapterId },
  };
}

export function layerForPath(path: string): string {
  if (path.startsWith("tests/") || path.includes("/__tests__/")) {
    return "test";
  }
  if (path.startsWith("docs/") || path.toLowerCase().endsWith(".md")) {
    return "docs";
  }
  if (path.startsWith("src/")) {
    return "application";
  }
  return "other";
}

export function ingestAnalysisRun(model: CodeIntelligenceModel, run: AnalysisRun): void {
  const { repositoryFullName, commitSha } = contextOf(run);
  const projectId = entityId("project", repositoryFullName, repositoryFullName);
  const repoId = entityId("repository", repositoryFullName, repositoryFullName);
  model.upsertEntity({
    id: projectId,
    kind: "project",
    name: repositoryFullName,
    path: undefined,
    repositoryFullName,
    commitSha,
    attributes: {},
  });
  model.upsertEntity({
    id: repoId,
    kind: "repository",
    name: repositoryFullName,
    path: undefined,
    repositoryFullName,
    commitSha,
    attributes: { ref: run.context.ref },
  });
  model.upsertRelation({
    id: relationId("contains", projectId, repoId),
    kind: "contains",
    fromId: projectId,
    toId: repoId,
  });

  const fileIds = new Map<string, string>();
  const componentsByPath = new Map<string, string[]>();
  const layersByPath = new Map<string, string>();
  for (const document of run.documents) {
    const file = fileEntity(document, repositoryFullName, commitSha);
    model.upsertEntity(file);
    fileIds.set(document.path, file.id);
    model.upsertRelation({
      id: relationId("contains", repoId, file.id),
      kind: "contains",
      fromId: repoId,
      toId: file.id,
    });

    const layerName = layerForPath(document.path);
    const layerId = entityId("layer", repositoryFullName, layerName);
    layersByPath.set(document.path, layerId);
    model.upsertEntity({
      id: layerId,
      kind: "layer",
      name: layerName,
      path: undefined,
      repositoryFullName,
      commitSha,
      attributes: {},
    });
    model.upsertRelation({
      id: relationId("contains", layerId, file.id),
      kind: "contains",
      fromId: layerId,
      toId: file.id,
    });

    const symbolIds = new Map<string, string>();
    for (const symbol of document.symbols) {
      const id = entityId(
        "symbol",
        repositoryFullName,
        `${document.path}#${symbol.kind}:${symbol.name}`,
      );
      symbolIds.set(`${symbol.kind}:${symbol.name}`, id);
      model.upsertEntity({
        id,
        kind: "symbol",
        name: symbol.name,
        path: document.path,
        repositoryFullName,
        commitSha,
        attributes: {
          symbolKind: symbol.kind,
          startLine: symbol.startLine,
          endLine: symbol.endLine,
        },
      });
      model.upsertRelation({
        id: relationId("contains", file.id, id),
        kind: "contains",
        fromId: file.id,
        toId: id,
      });
      if (symbol.kind === "class" || symbol.kind === "interface" || symbol.kind === "type") {
        const typeId = entityId("type", repositoryFullName, `${document.path}#${symbol.name}`);
        model.upsertEntity({
          id: typeId,
          kind: "type",
          name: symbol.name,
          path: document.path,
          repositoryFullName,
          commitSha,
          attributes: { symbolKind: symbol.kind },
        });
        model.upsertRelation({
          id: relationId("contains", file.id, typeId),
          kind: "contains",
          fromId: file.id,
          toId: typeId,
        });
      }
      if (isRuleName(symbol.name)) {
        const ruleId = entityId("rule", repositoryFullName, `${document.path}#${symbol.name}`);
        model.upsertEntity({
          id: ruleId,
          kind: "rule",
          name: symbol.name,
          path: document.path,
          repositoryFullName,
          commitSha,
          attributes: { source: "symbol-name" },
        });
        model.upsertRelation({
          id: relationId("governs", ruleId, id),
          kind: "governs",
          fromId: ruleId,
          toId: id,
        });
        model.upsertRelation({
          id: relationId("governs", ruleId, file.id),
          kind: "governs",
          fromId: ruleId,
          toId: file.id,
        });
      }
    }

    for (const relation of document.relations) {
      const fromId = entityId("type", repositoryFullName, `${document.path}#${relation.from}`);
      const toId = entityId("type", repositoryFullName, `${document.path}#${relation.to}`);
      if (model.getEntity(fromId) === undefined || model.getEntity(toId) === undefined) {
        continue;
      }
      const kind =
        relation.kind === "extends"
          ? "extends"
          : relation.kind === "implements"
            ? "implements"
            : "aliases";
      model.upsertRelation({
        id: relationId(kind, fromId, toId),
        kind,
        fromId,
        toId,
      });
    }

    for (const call of document.calls) {
      const fromKey =
        call.from === "<module>"
          ? undefined
          : [...symbolIds.entries()].find(
              ([key]) =>
                key.endsWith(`:${call.from}`) ||
                key === `function:${call.from}` ||
                key === `method:${call.from}` ||
                key === `constructor:${call.from}`,
            );
      const fromId =
        fromKey?.[1] ??
        [...symbolIds.values()].find((id) => model.getEntity(id)?.name === call.from) ??
        file.id;
      const toId =
        [...symbolIds.values()].find((id) => model.getEntity(id)?.name === call.to) ??
        entityId("symbol", repositoryFullName, `${document.path}#call:${call.to}`);
      if (model.getEntity(toId) === undefined) {
        model.upsertEntity({
          id: toId,
          kind: "symbol",
          name: call.to,
          path: document.path,
          repositoryFullName,
          commitSha,
          attributes: { external: true },
        });
      }
      model.upsertRelation({
        id: relationId("calls", fromId, toId),
        kind: "calls",
        fromId,
        toId,
      });
    }

    const pathComponentIds: string[] = [];
    for (const component of document.components) {
      const componentId = entityId(
        "component",
        repositoryFullName,
        `${document.path}#${component.kind}:${component.name}`,
      );
      pathComponentIds.push(componentId);
      model.upsertEntity({
        id: componentId,
        kind: "component",
        name: component.name,
        path: document.path,
        repositoryFullName,
        commitSha,
        attributes: { componentKind: component.kind },
      });
      model.upsertRelation({
        id: relationId("contains", file.id, componentId),
        kind: "contains",
        fromId: file.id,
        toId: componentId,
      });
      if (component.kind === "module") {
        const moduleId = entityId(
          "module",
          repositoryFullName,
          `${document.path}#${component.name}`,
        );
        model.upsertEntity({
          id: moduleId,
          kind: "module",
          name: component.name,
          path: document.path,
          repositoryFullName,
          commitSha,
          attributes: {},
        });
        model.upsertRelation({
          id: relationId("contains", file.id, moduleId),
          kind: "contains",
          fromId: file.id,
          toId: moduleId,
        });
      }
    }
    componentsByPath.set(document.path, pathComponentIds);

    for (const endpoint of document.endpoints) {
      const endpointId = entityId(
        "endpoint",
        repositoryFullName,
        `${document.path}#${endpoint.method}:${endpoint.path}`,
      );
      model.upsertEntity({
        id: endpointId,
        kind: "endpoint",
        name: `${endpoint.method} ${endpoint.path}`,
        path: document.path,
        repositoryFullName,
        commitSha,
        attributes: {
          method: endpoint.method,
          route: endpoint.path,
          handler: endpoint.handler,
        },
      });
      model.upsertRelation({
        id: relationId("exposes", file.id, endpointId),
        kind: "exposes",
        fromId: file.id,
        toId: endpointId,
      });
      const controller = document.components.find((component) => component.kind === "controller");
      if (controller !== undefined) {
        const controllerId = entityId(
          "component",
          repositoryFullName,
          `${document.path}#controller:${controller.name}`,
        );
        model.upsertRelation({
          id: relationId("exposes", controllerId, endpointId),
          kind: "exposes",
          fromId: controllerId,
          toId: endpointId,
        });
      }
    }

    for (const flow of document.dataFlows) {
      const fromId = entityId("symbol", repositoryFullName, `${document.path}#flow:${flow.from}`);
      const toId = entityId("symbol", repositoryFullName, `${document.path}#flow:${flow.to}`);
      if (model.getEntity(fromId) === undefined) {
        model.upsertEntity({
          id: fromId,
          kind: "symbol",
          name: flow.from,
          path: document.path,
          repositoryFullName,
          commitSha,
          attributes: { role: "data" },
        });
      }
      if (model.getEntity(toId) === undefined) {
        model.upsertEntity({
          id: toId,
          kind: "symbol",
          name: flow.to,
          path: document.path,
          repositoryFullName,
          commitSha,
          attributes: { role: "data" },
        });
      }
      model.upsertRelation({
        id: relationId("flows-to", fromId, toId),
        kind: "flows-to",
        fromId,
        toId,
        attributes: { flowKind: flow.kind },
      });
    }
  }

  for (const link of run.links) {
    const fromId = fileIds.get(link.fromPath);
    const toId = fileIds.get(link.toPath);
    if (fromId === undefined || toId === undefined) {
      continue;
    }
    model.upsertRelation({
      id: relationId("imports", fromId, toId),
      kind: "imports",
      fromId,
      toId,
    });
    model.upsertRelation({
      id: relationId("depends-on", fromId, toId),
      kind: "depends-on",
      fromId,
      toId,
    });
    for (const fromComponent of componentsByPath.get(link.fromPath) ?? []) {
      for (const toComponent of componentsByPath.get(link.toPath) ?? []) {
        model.upsertRelation({
          id: relationId("depends-on", fromComponent, toComponent),
          kind: "depends-on",
          fromId: fromComponent,
          toId: toComponent,
        });
      }
    }
    const fromLayer = layersByPath.get(link.fromPath);
    const toLayer = layersByPath.get(link.toPath);
    if (fromLayer !== undefined && toLayer !== undefined && fromLayer !== toLayer) {
      model.upsertRelation({
        id: relationId("depends-on", fromLayer, toLayer),
        kind: "depends-on",
        fromId: fromLayer,
        toId: toLayer,
      });
    }
  }
}
