import type { IntelligenceHost } from "./host.js";
import type { McpToolResult } from "./protocol.js";
import { asObject, optionalInteger, optionalString, requiredString } from "./args.js";
import { citationFrom, formatAgentResult, formatToolError } from "./format.js";
import type { NamedEdge } from "../cim/graphs.js";
import type { CimEntity } from "../cim/types.js";
import type { RetrievalHit } from "../rag/types.js";

export type ToolHandler = (args: unknown) => Promise<McpToolResult>;

function entityView(entity: CimEntity): Record<string, unknown> {
  const view: Record<string, unknown> = {
    id: entity.id,
    kind: entity.kind,
    name: entity.name,
  };
  if (entity.path !== undefined) {
    view.path = entity.path;
  }
  if (Object.keys(entity.attributes).length > 0) {
    view.attributes = entity.attributes;
  }
  return view;
}

function uniqueEdges(edges: NamedEdge[]): NamedEdge[] {
  const seen = new Set<string>();
  return edges.filter((edge) => {
    const key = `${edge.fromKind}:${edge.from}->${edge.toKind}:${edge.to}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function createToolHandlers(host: IntelligenceHost): Map<string, ToolHandler> {
  const handlers = new Map<string, ToolHandler>();

  handlers.set("codehound_status", async () => {
    const projects = host.summaries();
    return formatAgentResult(
      "codehound_status",
      `Codehound MCP is serving ${projects.length} project(s).`,
      {
        name: "codehound",
        projectCount: projects.length,
        projects: projects.map((project) => project.fullName),
        hasRetriever: host.retriever !== undefined,
      },
      { hints: ["Call codehound_list_projects to inspect indexed repositories."] },
    );
  });

  handlers.set("codehound_list_projects", async (raw) => {
    const args = asObject(raw);
    const projects = host.summaries(optionalString(args, "query"));
    return formatAgentResult("codehound_list_projects", `Found ${projects.length} project(s).`, {
      projects,
    });
  });

  handlers.set("codehound_get_project", async (raw) => {
    const args = asObject(raw);
    const repository = requiredString(args, "repository");
    const project = host.require(repository);
    const query = host.query(repository);
    const summary = host.summarize(project);
    return formatAgentResult("codehound_get_project", `Project ${summary.fullName}.`, {
      ...summary,
      layers: query.architectureLayers().map((entity) => entity.name),
      componentCount: query.components().length,
      ruleCount: query.rules().length,
      symbolCount: query.byKind("symbol").length,
    });
  });

  handlers.set("codehound_list_files", async (raw) => {
    const args = asObject(raw);
    const repository = requiredString(args, "repository");
    const pathPrefix = optionalString(args, "pathPrefix");
    const files = host
      .query(repository)
      .byKind("file")
      .filter((entity) => pathPrefix === undefined || (entity.path ?? "").startsWith(pathPrefix))
      .map((entity) => ({
        path: entity.path ?? entity.name,
        language: entity.attributes.language,
      }));
    return formatAgentResult(
      "codehound_list_files",
      `${files.length} file(s) in ${repository}.`,
      { repository, files },
      { citations: files.map((file) => citationFrom(file.path)) },
    );
  });

  handlers.set("codehound_search_code", async (raw) => {
    const args = asObject(raw);
    const text = requiredString(args, "query");
    const retriever = host.retriever;
    if (retriever === undefined) {
      return formatToolError("codehound_search_code", "No retriever is configured");
    }
    const repository = optionalString(args, "repository");
    const pathPrefix = optionalString(args, "pathPrefix");
    const limit = optionalInteger(args, "limit", 8);
    const searchQuery: {
      text: string;
      limit: number;
      repositoryFullName?: string;
      pathPrefix?: string;
    } = { text, limit };
    if (repository !== undefined) {
      searchQuery.repositoryFullName = repository;
    }
    if (pathPrefix !== undefined) {
      searchQuery.pathPrefix = pathPrefix;
    }
    const hits = await retriever.search(searchQuery);
    return formatAgentResult(
      "codehound_search_code",
      `Retrieved ${hits.length} chunk(s) for ${JSON.stringify(text)}.`,
      {
        hits: hits.map((hit) => hitView(hit)),
      },
      {
        citations: hits.map((hit) =>
          citationFrom(hit.chunk.path, {
            startLine: hit.chunk.startLine,
            endLine: hit.chunk.endLine,
            ...(hit.chunk.symbol !== undefined ? { symbol: hit.chunk.symbol } : {}),
          }),
        ),
      },
    );
  });

  handlers.set("codehound_get_file_context", async (raw) => {
    const args = asObject(raw);
    const repository = requiredString(args, "repository");
    const path = requiredString(args, "path");
    const project = host.require(repository);
    const query = host.query(repository);
    const file = query
      .entities({ kind: "file", pathPrefix: path })
      .find((entity) => entity.path === path);
    const symbols = query
      .entities({ kind: "symbol", pathPrefix: path })
      .filter((entity) => entity.path === path)
      .map(entityView);
    const content = project.files.get(path);
    let hits: RetrievalHit[] = [];
    if (host.retriever !== undefined) {
      hits = await host.retriever.search({
        text: `${path} ${symbols.map((symbol) => String(symbol.name)).join(" ")}`.trim(),
        repositoryFullName: repository,
        pathPrefix: path,
        limit: 5,
      });
    }
    if (file === undefined && content === undefined) {
      return formatToolError("codehound_get_file_context", `File ${path} is not indexed`);
    }
    return formatAgentResult(
      "codehound_get_file_context",
      `Context for ${path}.`,
      {
        path,
        language: file?.attributes.language,
        content: content ?? "",
        symbols,
        chunks: hits.map((hit) => hitView(hit)),
      },
      { citations: [citationFrom(path)] },
    );
  });

  handlers.set("codehound_get_dependencies", async (raw) => {
    const args = asObject(raw);
    const repository = requiredString(args, "repository");
    const path = requiredString(args, "path");
    const query = host.query(repository);
    const files = query.fileDependencies().filter((edge) => edge.from === path);
    const components = query.componentDependencies().filter((edge) => {
      const from = query
        .components()
        .find((entity) => entity.name === edge.from && entity.path === path);
      return from !== undefined;
    });
    return formatAgentResult(
      "codehound_get_dependencies",
      `${path} depends on ${files.length} file(s).`,
      { path, files: uniqueEdges(files), components: uniqueEdges(components) },
      { citations: [citationFrom(path), ...files.map((edge) => citationFrom(edge.to))] },
    );
  });

  handlers.set("codehound_get_dependents", async (raw) => {
    const args = asObject(raw);
    const repository = requiredString(args, "repository");
    const path = requiredString(args, "path");
    const files = host
      .query(repository)
      .fileDependencies()
      .filter((edge) => edge.to === path);
    return formatAgentResult(
      "codehound_get_dependents",
      `${files.length} file(s) depend on ${path}.`,
      { path, files: uniqueEdges(files) },
      { citations: [citationFrom(path), ...files.map((edge) => citationFrom(edge.from))] },
    );
  });

  handlers.set("codehound_get_callers", async (raw) => {
    const args = asObject(raw);
    const repository = requiredString(args, "repository");
    const symbol = requiredString(args, "symbol");
    const callers = uniqueEdges(
      host
        .query(repository)
        .calls()
        .filter((edge) => edge.to === symbol),
    );
    return formatAgentResult("codehound_get_callers", `${callers.length} caller(s) of ${symbol}.`, {
      symbol,
      callers,
    });
  });

  handlers.set("codehound_get_callees", async (raw) => {
    const args = asObject(raw);
    const repository = requiredString(args, "repository");
    const symbol = requiredString(args, "symbol");
    const callees = uniqueEdges(
      host
        .query(repository)
        .calls()
        .filter((edge) => edge.from === symbol),
    );
    return formatAgentResult(
      "codehound_get_callees",
      `${symbol} calls ${callees.length} symbol(s).`,
      { symbol, callees },
    );
  });

  handlers.set("codehound_list_components", async (raw) => {
    const args = asObject(raw);
    const repository = requiredString(args, "repository");
    const query = host.query(repository);
    const components = query.components().map(entityView);
    return formatAgentResult(
      "codehound_list_components",
      `${components.length} component(s) in ${repository}.`,
      {
        components,
        dependencies: uniqueEdges(query.componentDependencies()),
      },
    );
  });

  handlers.set("codehound_list_layers", async (raw) => {
    const args = asObject(raw);
    const repository = requiredString(args, "repository");
    const query = host.query(repository);
    const layers = query.architectureLayers().map((layer) => ({
      name: layer.name,
      files: query
        .byKind("file")
        .filter((file) =>
          query
            .relations("contains")
            .some((relation) => relation.fromId === layer.id && relation.toId === file.id),
        )
        .map((file) => file.path ?? file.name),
    }));
    return formatAgentResult(
      "codehound_list_layers",
      `${layers.length} layer(s) in ${repository}.`,
      { layers },
    );
  });

  handlers.set("codehound_get_architecture", async (raw) => {
    const args = asObject(raw);
    const repository = requiredString(args, "repository");
    const query = host.query(repository);
    return formatAgentResult("codehound_get_architecture", `Architecture for ${repository}.`, {
      layers: query.architectureLayers().map((entity) => entity.name),
      layerDependencies: uniqueEdges(query.layerDependencies()),
      components: query.components().map(entityView),
    });
  });

  handlers.set("codehound_list_rules", async (raw) => {
    const args = asObject(raw);
    const repository = requiredString(args, "repository");
    const rules = host.query(repository).rules().map(entityView);
    return formatAgentResult("codehound_list_rules", `${rules.length} rule(s) in ${repository}.`, {
      rules,
    });
  });

  handlers.set("codehound_get_rule", async (raw) => {
    const args = asObject(raw);
    const repository = requiredString(args, "repository");
    const name = requiredString(args, "name");
    const query = host.query(repository);
    const rule = query.rules().find((entity) => entity.name === name);
    if (rule === undefined) {
      return formatToolError("codehound_get_rule", `Rule ${name} was not found`);
    }
    const governed = query
      .ruleBindings()
      .edges.filter((edge) => edge.fromId === rule.id)
      .flatMap((edge) => {
        const entity = query.entities().find((item) => item.id === edge.toId);
        return entity === undefined ? [] : [entityView(entity)];
      });
    return formatAgentResult(
      `codehound_get_rule`,
      `Rule ${name} governs ${governed.length} target(s).`,
      {
        rule: entityView(rule),
        governs: governed,
      },
    );
  });

  handlers.set("codehound_analyze_impact", async (raw) => {
    const args = asObject(raw);
    const repository = requiredString(args, "repository");
    const path = optionalString(args, "path");
    const symbol = optionalString(args, "symbol");
    if (path === undefined && symbol === undefined) {
      throw new Error("path or symbol is required");
    }
    const query = host.query(repository);
    const dependents =
      path === undefined
        ? []
        : uniqueEdges(query.fileDependencies().filter((edge) => edge.to === path));
    const dependencies =
      path === undefined
        ? []
        : uniqueEdges(query.fileDependencies().filter((edge) => edge.from === path));
    const callers =
      symbol === undefined ? [] : uniqueEdges(query.calls().filter((edge) => edge.to === symbol));
    const callees =
      symbol === undefined ? [] : uniqueEdges(query.calls().filter((edge) => edge.from === symbol));
    const rules = query.rules().filter((rule) => {
      if (path !== undefined && rule.path === path) {
        return true;
      }
      return symbol !== undefined && rule.name === symbol;
    });
    const layers =
      path === undefined
        ? []
        : query
            .architectureLayers()
            .filter((layer) =>
              query
                .relations("contains")
                .some(
                  (relation) =>
                    relation.fromId === layer.id &&
                    query
                      .byKind("file")
                      .some((file) => file.id === relation.toId && file.path === path),
                ),
            )
            .map((layer) => layer.name);
    const target = path ?? symbol ?? repository;
    return formatAgentResult(
      "codehound_analyze_impact",
      `Impact of ${target}: ${dependents.length} dependent file(s), ${callers.length} caller(s).`,
      {
        path,
        symbol,
        dependents,
        dependencies,
        callers,
        callees,
        layers,
        rules: rules.map(entityView),
      },
      {
        citations: [
          ...(path !== undefined ? [citationFrom(path)] : []),
          ...dependents.map((edge) => citationFrom(edge.from)),
        ],
        hints: ["Use codehound_compose_context to attach retrieved code to this impact set."],
      },
    );
  });

  handlers.set("codehound_compose_context", async (raw) => {
    const args = asObject(raw);
    const text = requiredString(args, "query");
    const repository = optionalString(args, "repository");
    const limit = optionalInteger(args, "limit", 6);
    const retriever = host.retriever;
    const searchQuery: {
      text: string;
      limit: number;
      repositoryFullName?: string;
    } = { text, limit };
    if (repository !== undefined) {
      searchQuery.repositoryFullName = repository;
    }
    const hits = retriever === undefined ? [] : await retriever.search(searchQuery);
    const repoName = repository ?? hits[0]?.chunk.repositoryFullName;
    const cim =
      repoName === undefined
        ? undefined
        : (() => {
            try {
              return host.query(repoName);
            } catch {
              return undefined;
            }
          })();
    const paths = [...new Set(hits.map((hit) => hit.chunk.path))];
    const neighbors = paths.flatMap((path) => {
      if (cim === undefined) {
        return [];
      }
      const files = cim.fileDependencies().filter((edge) => edge.from === path || edge.to === path);
      const rules = cim.rules().filter((rule) => rule.path === path);
      const symbols = cim
        .entities({ kind: "symbol", pathPrefix: path })
        .filter((entity) => entity.path === path)
        .map((entity) => entity.name);
      return [{ path, symbols, files: uniqueEdges(files), rules: rules.map((rule) => rule.name) }];
    });
    return formatAgentResult(
      "codehound_compose_context",
      `Composed ${hits.length} chunk(s) with CIM neighbors for ${JSON.stringify(text)}.`,
      {
        query: text,
        repository: repoName,
        retrieval: hits.map((hit) => hitView(hit)),
        graph: neighbors,
      },
      {
        citations: hits.map((hit) =>
          citationFrom(hit.chunk.path, {
            startLine: hit.chunk.startLine,
            endLine: hit.chunk.endLine,
            ...(hit.chunk.symbol !== undefined ? { symbol: hit.chunk.symbol } : {}),
          }),
        ),
        hints: ["Prefer cited paths when editing; graph neighbors are likely blast radius."],
      },
    );
  });

  return handlers;
}

function hitView(hit: RetrievalHit): Record<string, unknown> {
  const view: Record<string, unknown> = {
    path: hit.chunk.path,
    score: hit.score,
    source: hit.source,
    startLine: hit.chunk.startLine,
    endLine: hit.chunk.endLine,
    text: hit.chunk.text,
  };
  if (hit.chunk.symbol !== undefined) {
    view.symbol = hit.chunk.symbol;
  }
  return view;
}
