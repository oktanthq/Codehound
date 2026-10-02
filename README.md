# Codehound

Codehound is an AI-powered code intelligence engine. It combines retrieval-augmented generation (RAG), static code analysis, and a Code Intelligence Model (CIM) to build a persistent, queryable understanding of software systems.

It analyzes repositories to extract ASTs, dependencies, call graphs, component relationships, data flows, architecture, and business rules. That model is exposed to coding agents through MCP and used for context-aware PR reviews, code-change suggestions, and vulnerability assessment.

## Stack

TypeScript on Node.js 20+. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for why this stack was chosen and how the system is laid out.

## Requirements

- Node.js 20 or later (22 recommended; see `.nvmrc`)
- npm 10 or later

## Setup

```bash
npm install
cp .env.example .env
```

Fill GitHub App credentials in `.env`. Credentials are read from the environment only; never commit secrets.

| Variable                    | Required | Purpose                                      |
| --------------------------- | -------- | -------------------------------------------- |
| `GITHUB_APP_ID`             | yes      | GitHub App identifier used as the JWT issuer |
| `GITHUB_APP_PRIVATE_KEY`    | yes      | PEM private key, or base64-encoded PEM       |
| `GITHUB_APP_CLIENT_ID`      | no       | OAuth client id for later user flows         |
| `GITHUB_APP_CLIENT_SECRET`  | no       | OAuth client secret                          |
| `GITHUB_APP_WEBHOOK_SECRET` | no       | Webhook signature secret                     |
| `GITHUB_API_URL`            | no       | Defaults to `https://api.github.com`         |
| `CODEHOUND_INGEST_ROOT`     | no       | Directory for cloned worktrees               |

`GITHUB_APP_PRIVATE_KEY` may contain literal newlines, escaped `\n` sequences, or a base64-encoded PEM. PKCS#1 (`BEGIN RSA PRIVATE KEY`) and PKCS#8 (`BEGIN PRIVATE KEY`) are both accepted.

## Scripts

```bash
npm test            # run the test suite once
npm run test:watch  # vitest in watch mode
npm run typecheck   # TypeScript without emitting
npm run lint        # ESLint
npm run format      # Prettier write
npm run format:check
npm run build       # emit dist/ (not required to run tests)
```

## Status

Work is tracked in Linear. Completed issues are listed in [docs/PROGRESS.md](docs/PROGRESS.md).
