# Architecture

## Stack choice

Codehound is a long-lived platform: GitHub App integration first, then static analysis, RAG, a queryable Code Intelligence Model, an MCP server, PR review, change suggestions, and vulnerability assessment.

**TypeScript on Node.js 20+** is the primary language for this codebase.

Reasons:

- The GitHub App, REST, and webhook surface is first-class in Node (`fetch`, well-tested JWT/RS256 libraries, and a direct mapping to GitHub's HTTP APIs).
- The Model Context Protocol that later milestones expose to coding agents is specified around JSON-RPC over stdio/HTTP, which fits a typed Node service without introducing a second runtime.
- Static analysis and RAG can be added as libraries (tree-sitter bindings, embedding clients, vector stores) behind module boundaries. Python analysis workers can still be introduced later if a specific parser or model stack requires them; they would sit behind the same `src/analysis` and `src/rag` interfaces.
- One typed runtime keeps CI, packaging, and local setup simple while the GitHub Integration milestone is still the foundation everything else clones and queries against.

Postgres (or an equivalent store) and a hosted vector index can replace the in-memory GitHub metadata, analysis, RAG, and CIM stores without rewriting those module boundaries. This tree keeps embeddings, vectors, and the CIM graph behind local implementations so tests and early local use do not need external credentials.

## Layout

```
src/
  index.ts              public package exports
  github/               GitHub App credentials, JWT, authz, discovery, ingest (OKT-21+)
  analysis/             static analysis engine (OKT-32+)
  rag/                  chunking, embeddings, retrieval (OKT-44+)
  cim/                  project model / ontology (OKT-55+)
  mcp/                  MCP project intelligence server (OKT-69+)
  review/               PR review (OKT-81+)
  suggestions/          code-change suggestions (OKT-95+)
  security/             vulnerability assessment (OKT-107+)
tests/                  vitest suites mirroring src/
docs/                   architecture and progress
.github/workflows/      CI
```

Modules that are not implemented yet are omitted from `src/` until their issues land. Callers should import from `src/github`, `src/analysis`, `src/rag`, `src/cim`, `src/mcp`, or `src/review` (or the package root) rather than reaching around GitHub HTTP, parser, embedding, graph, or JSON-RPC details.

## GitHub Integration

GitHub access is installation-based, not personal-access-token-based.

1. **App credentials** (`GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`) load from the environment.
2. **App JWT** (RS256, short-lived) authenticates as the GitHub App.
3. **Installation access tokens** are minted per installation and cached until shortly before expiry.
4. **Authorization** checks that an installation can see a repository and holds the required permission rank (`read` < `write` < `admin`).
5. **Discovery** lists installation repositories, with filters, and records which repos are selected for analysis.
6. **Ingest** clones a selected, authorized repository into a local worktree and records a snapshot (ref, SHA, files) for later analysis.
7. **Branch tracking** records branch heads and commits (from the GitHub API or from webhook payloads) and the last ingested SHA per branch.
8. **Webhooks** verify `X-Hub-Signature-256`, parse GitHub events, and update branch tracking for push/delete.
9. **Incremental ingest** fast-forwards an existing worktree when the new commit is a descendant of the last ingest; otherwise it reclones. Push webhooks drive this path.
10. **Language detection** classifies each ingested file (extension, filename, shebang) and records a language inventory plus a primary language.
11. **Metadata storage** keeps repository and per-commit version records (languages, files, SHAs) behind a store interface; the in-memory implementation is for tests and early local use.
12. **Retry** wraps clone/ingest with exponential backoff, skips non-retryable authorization errors, and records per-attempt job status.

## Code Analysis Engine

Analysis is language-agnostic at the pipeline layer. GitHub ingest produces a file list with detected languages; the analysis engine does not parse GitHub HTTP itself.

1. **Adapters** implement `LanguageAdapter` for one or more languages and emit a shared document shape (`symbols`, `imports`, `calls`, `relations`, `endpoints`, `dataFlows`, `components`). The TypeScript adapter parses TypeScript and JavaScript with the compiler API (syntactic diagnostics, then a source-file AST), then walks that tree for declarations, module specifiers, calls, heritage, HTTP routes, and local data flow.
2. **Registry** maps a detected language name to the first registered adapter. Unknown or undetected languages are skipped, not fatal. The initial targets are TypeScript and JavaScript, with framework hints for React, Express, and Nest.
3. **Pipeline** walks an ingest file list, dispatches each file, isolates adapter failures so one file cannot abort the run, and resolves relative imports into cross-file links.
4. **Results** are `AnalysisDocument` values plus a skip list and import links. `InMemoryAnalysisStore` keeps runs by repository and commit SHA.

Callers should import from `src/analysis` (or the package root) rather than constructing language-specific parsers ad hoc.

## Code RAG and retrieval

Retrieval sits on analysis documents and raw file text. It does not call GitHub HTTP.

1. **Chunking** splits source on extracted symbols (plus a file preamble) and markdown on headings; leftover text uses a sliding window (40 lines, 5-line overlap).
2. **Embeddings** go through an `Embedder` interface. `HashingEmbedder` is the local default (token hashing, L2-normalized, cosine similarity). A remote embedding client can implement the same interface later.
3. **Vector storage** is a `VectorStore`. `InMemoryVectorStore` holds embedded chunks and filters by repository, path, language, and symbol metadata.
4. **Search** combines semantic nearest-neighbor search with BM25 keyword search (`k1=1.2`, `b=0.75`). Hybrid retrieval fuses the two ranked lists with reciprocal rank fusion (`k=60`).
5. **Ranking** wraps any retriever: symbol-name boosts, metadata filters, and path/rerank boosts.
6. **Incremental index** replaces chunks for a path or repository when the SHA-256 digest of chunk text changes.
7. **Eval** scores retrievers with recall@k and mean reciprocal rank on labeled cases.

## Code Intelligence Model

The CIM is a typed entity/relation graph built from an `AnalysisRun`.

1. **Ontology** names entity kinds (project, repository, file, module, symbol, component, endpoint, type, layer, rule) and relation kinds (contains, imports, depends-on, calls, extends, implements, aliases, exposes, flows-to, governs).
2. **Ingest** maps analysis documents into that graph: files and symbols, import/dependency edges, calls, components and modules, endpoints, data-flow `flows-to` edges, architecture layers from path prefixes, and business rules from `validate`/`assert`/`ensure`/`check`/`guard` symbol names (`governs` the symbol and its file).
3. **Storage** is a `CimStore`. `InMemoryCimStore` keeps versioned snapshots per repository. `persistNewVersion` bumps the model version before save.
4. **Incremental updates** drop entities (and incident relations) by file path, then re-ingest the new analysis for that path.
5. **Query** (`CimQueryLayer`) exposes entity filters plus dependency, call, component, layer, data-flow, and rule-binding graphs.

## MCP project intelligence server

The MCP server speaks JSON-RPC 2.0 over newline-delimited stdio (and Content-Length frames). It does not require a hosted MCP gateway.

1. **Protocol** supports `2024-11-05`, `2025-03-26`, and `2025-06-18`. `initialize`, `ping`, `tools/list`, `tools/call`, empty `resources/list` / `prompts/list`, and `notifications/initialized` are implemented.
2. **Tools** are named `codehound_*` and cover project discovery, code retrieval, dependency and call graphs, components and layers, business rules, impact analysis, and RAG+CIM context composition.
3. **Host** (`IntelligenceHost`) holds in-memory CIM models, file text, and an optional `Retriever`. Tests use the local hashing embedder and hybrid retriever; a remote retriever can be injected later.
4. **Responses** are agent-oriented: JSON text plus `structuredContent` with `summary`, `data`, `citations`, and `hints`.

## Pull request review

PR review talks to GitHub through the existing App installation client (mocked HTTP in tests).

1. **Ingest** loads a pull request, its files, and commits, and stores them in `InMemoryPullStore`. `pull_request` webhooks can trigger the same path.
2. **Diff analysis** parses unified patches into hunks and added/deleted line numbers.
3. **Changed-code context** retrieves indexed chunks that overlap those lines.
4. **Impact** asks the CIM for dependents, dependencies, layers, and rules of changed paths.
5. **Detectors** scan added and deleted lines for smells, bad practices, architecture and rule violations, regression risk, and security sinks. A classifier can raise severity when a file has many dependents.
6. **Comments and summary** turn findings into Markdown inline comments and a review body. High or critical findings request changes; a clean review approves.
7. **Publish** posts that review through the GitHub App installation client (`pull_requests:write`). Tests mock HTTP.

## Code-change suggestions

Suggestions are local rewrites, not a hosted model API.

1. **Pipeline** maps a finding or issue onto code, generates single-file and multi-file edits, emits unified diffs, and validates the result.
2. **Guards** refuse dropped exports that still have dependents, application imports of tests, and deletion of `validate`/`assert`/`ensure`/`check`/`guard` rules.
3. **Tests** propose a companion test module for new `src/` exports.
4. **Integration** attaches a `diff` fence to matching PR review comments when validation passes.

## Design rules

- Secrets never appear in git, logs, or thrown error messages.
- GitHub HTTP is behind a small client so tests do not need the network.
- Selection and ingest stores are interfaces; the in-memory implementations are for tests and early local use.
- Authorization is explicit: discovery, selection, and clone all go through the same authorizer.
