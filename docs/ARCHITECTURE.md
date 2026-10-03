# Architecture

## Stack choice

Codehound is a long-lived platform: GitHub App integration first, then static analysis, RAG, a queryable Code Intelligence Model, an MCP server, PR review, change suggestions, and vulnerability assessment.

**TypeScript on Node.js 20+** is the primary language for this codebase.

Reasons:

- The GitHub App, REST, and webhook surface is first-class in Node (`fetch`, well-tested JWT/RS256 libraries, and a direct mapping to GitHub's HTTP APIs).
- The Model Context Protocol that later milestones expose to coding agents is specified around JSON-RPC over stdio/HTTP, which fits a typed Node service without introducing a second runtime.
- Static analysis and RAG can be added as libraries (tree-sitter bindings, embedding clients, vector stores) behind module boundaries. Python analysis workers can still be introduced later if a specific parser or model stack requires them; they would sit behind the same `src/analysis` and `src/rag` interfaces.
- One typed runtime keeps CI, packaging, and local setup simple while the GitHub Integration milestone is still the foundation everything else clones and queries against.

Postgres (or an equivalent store) and a vector index are planned once repository metadata and RAG land. This milestone keeps those behind in-memory interfaces so later issues can swap persistence without rewriting GitHub auth, discovery, or ingest.

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

Modules that are not implemented yet are omitted from `src/` until their issues land. Callers should import from `src/github` (or the package root) rather than reaching around GitHub HTTP details.

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

Later issues in this milestone add language detection, metadata storage, and retry.

## Design rules

- Secrets never appear in git, logs, or thrown error messages.
- GitHub HTTP is behind a small client so tests do not need the network.
- Selection and ingest stores are interfaces; the in-memory implementations are for tests and early local use.
- Authorization is explicit: discovery, selection, and clone all go through the same authorizer.
