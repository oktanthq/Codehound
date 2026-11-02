# Codehound

Codehound is an AI-powered code intelligence engine. It combines retrieval-augmented generation (RAG), static code analysis, and a Code Intelligence Model (CIM) to build a persistent, queryable understanding of software systems.

It analyzes repositories to extract ASTs, dependencies, call graphs, component relationships, data flows, architecture, and business rules. That model is exposed to coding agents through MCP and used for context-aware PR reviews, code-change suggestions, and vulnerability assessment.

## System overview

The engine is a TypeScript library. Callers import from the package root (or a module under `src/`) rather than talking to GitHub, parsers, embeddings, or vulnerability feeds directly.

1. **GitHub integration** (`src/github`) authenticates as a GitHub App, discovers and authorizes repositories, clones or incrementally updates worktrees, tracks branches, and handles webhooks.
2. **Code analysis** (`src/analysis`) runs language adapters over ingested files. The TypeScript/JavaScript adapter uses the compiler API to extract symbols, imports, calls, types, HTTP endpoints, data flow, and components.
3. **RAG** (`src/rag`) chunks those documents, embeds them, and retrieves with semantic search, BM25, and hybrid reciprocal-rank fusion.
4. **CIM** (`src/cim`) turns an analysis run into a versioned entity/relation graph (files, symbols, components, layers, rules) with a query layer for impact analysis.
5. **MCP server** (`src/mcp`) exposes that graph and retrieval over JSON-RPC 2.0 stdio as `codehound_*` tools.
6. **PR review** (`src/review`) ingests a pull request, scans the diff, classifies findings, and can publish a GitHub review.
7. **Change suggestions** (`src/suggestions`) map findings to local rewrites, emit unified diffs, and validate them against dependency, architecture, and rule guards.
8. **Vulnerability assessment** (`src/security`) runs a pipeline of scanners (SAST, dependency advisories, secrets, auth, taint/data-flow, injection, insecure APIs, security rules, cross-component tracing), classifies severity, suggests remediations, and merges findings into PR reviews.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for layout and design rules, and [docs/PROGRESS.md](docs/PROGRESS.md) for completed issues.

## Stack

TypeScript on Node.js 20+. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for why this stack was chosen.

## Requirements

- Node.js 20 or later (22 recommended; see `.nvmrc`)
- npm 10 or later

## Setup

```bash
npm install
cp .env.example .env
```

Fill GitHub App credentials in `.env` for live GitHub calls. Credentials are read from the environment only; never commit secrets. Default tests stay offline: they mock GitHub HTTP or talk to a local server. They do not need a real App.

| Variable                      | Required                          | Purpose                                        |
| ----------------------------- | --------------------------------- | ---------------------------------------------- |
| `GITHUB_APP_ID`               | yes (live App / webhook server)   | GitHub App identifier used as the JWT issuer   |
| `GITHUB_APP_PRIVATE_KEY`      | yes (live App / webhook server)   | PEM private key, or base64-encoded PEM         |
| `GITHUB_APP_CLIENT_ID`        | no                                | OAuth client id for later user flows           |
| `GITHUB_APP_CLIENT_SECRET`    | no                                | OAuth client secret                            |
| `GITHUB_APP_WEBHOOK_SECRET`   | yes (webhook server / live tests) | Webhook `X-Hub-Signature-256` secret           |
| `GITHUB_API_URL`              | no                                | Defaults to `https://api.github.com`           |
| `CODEHOUND_INGEST_ROOT`       | no                                | Directory for cloned worktrees                 |
| `CODEHOUND_PORT` / `PORT`     | no                                | Webhook server listen port (default `3000`)    |
| `GITHUB_TEST_REPO`            | live suite only                   | Sandbox `owner/name` for `npm run test:live`   |
| `GITHUB_TEST_INSTALLATION_ID` | live suite only                   | Optional installation id (otherwise listed)    |
| `GITHUB_TEST_PULL_NUMBER`     | live suite only                   | Optional open PR (otherwise the first open PR) |

`GITHUB_APP_PRIVATE_KEY` may contain literal newlines, escaped `\n` sequences, or a base64-encoded PEM. PKCS#1 (`BEGIN RSA PRIVATE KEY`) and PKCS#8 (`BEGIN PRIVATE KEY`) are both accepted.

## Webhook server

`src/server/webhooks.ts` is an HTTP entry point. `POST /webhooks/github` reads the raw body, verifies `X-Hub-Signature-256` through `WebhookHandler`, returns **401** for a bad signature, **202** for accepted or duplicate deliveries, and dispatches `pull_request` events (`opened`, `synchronize`, `reopened`, `ready_for_review`) to ingestion and review.

```bash
npm run build
npm start
# or: npm run serve
# or: node dist/cli.js serve
```

`codehound serve` after `npm run build` (or `npx codehound serve`) is the same command. Point the GitHub App webhook URL at `http://<host>:<CODEHOUND_PORT>/webhooks/github`.

## Scripts

```bash
npm test            # offline suite (excludes live GitHub tests)
npm run test:live   # opt-in live GitHub suite; skips without credentials
npm run test:watch  # vitest in watch mode
npm run typecheck   # TypeScript without emitting
npm run lint        # ESLint
npm run format      # Prettier write
npm run format:check
npm run build       # emit dist/ (required for npm start)
npm start           # webhook server (`codehound serve`)
npm run serve       # alias for npm start
```

`npm run test:live` uses `createFetchHttpClient` against the real GitHub API. It is skipped unless `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_WEBHOOK_SECRET`, and `GITHUB_TEST_REPO` are set. When those are present it mints an installation token, lists repositories, ingests a pull request, and publishes a `COMMENT` review on the sandbox repo.

## Interfaces that still need hosted backends

These seams are implemented locally so the library and tests run without external credentials. Swap the implementation; keep the type.

| Interface                          | Local implementation                                               | Hosted backend when credentials exist                     |
| ---------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------- |
| `Embedder`                         | `HashingEmbedder`                                                  | Remote embedding API                                      |
| `VectorStore`                      | `InMemoryVectorStore`                                              | Hosted vector index                                       |
| `CimStore`                         | `InMemoryCimStore`                                                 | Postgres (or equivalent)                                  |
| `AnalysisStore`                    | `InMemoryAnalysisStore`                                            | Durable analysis store                                    |
| `AdvisoryDatabase`                 | `LocalAdvisoryDatabase`                                            | OSV, GitHub Advisory, or similar feed                     |
| GitHub HTTP client                 | `createFetchHttpClient` against a local server in default tests    | Live GitHub App installation tokens (`npm run test:live`) |
| Change / remediation generation    | Local line rewrites (`generateSuggestions`, `suggestRemediations`) | Hosted generation API                                     |
| Metadata / selection / pull stores | In-memory maps                                                     | Durable repository metadata                               |
| Language adapters                  | TypeScript and JavaScript                                          | Additional language workers behind `LanguageAdapter`      |

## Status

Linear milestones through Vulnerability Assessment (OKT-21 through OKT-120) are implemented on `dev`. OKT-30 is an archived duplicate of OKT-31 and was skipped. Completed issues are listed in [docs/PROGRESS.md](docs/PROGRESS.md).
