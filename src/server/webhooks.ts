import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { GitHubApp, type GitHubAppOptions } from "../github/app.js";
import { RepositoryAuthorizer } from "../github/authz.js";
import {
  loadWebhookServerConfig,
  type EnvMap,
  type WebhookServerConfig,
} from "../github/config.js";
import { GitHubAppError } from "../github/errors.js";
import type { HttpClient } from "../github/http.js";
import { InMemorySelectionStore } from "../github/selection.js";
import {
  WebhookHandler,
  type ParsedPullRequest,
  type ParsedWebhook,
  type WebhookHeaders,
} from "../github/webhooks.js";
import { reviewPull, type ReviewInput, type ReviewReport } from "../review/engine.js";
import { PullRequestIngestor } from "../review/ingest.js";
import { GitHubReviewPublisher } from "../review/publish.js";
import { InMemoryPullStore } from "../review/store.js";

export const GITHUB_WEBHOOK_PATH = "/webhooks/github";

const REVIEWABLE_PULL_ACTIONS = new Set(["opened", "synchronize", "reopened", "ready_for_review"]);

export type PullRequestDispatcher = (event: ParsedPullRequest) => Promise<void>;

export type WebhookDispatch = {
  pullRequest?: PullRequestDispatcher;
};

export type WebhookServerOptions = {
  handler: WebhookHandler;
  dispatch?: WebhookDispatch;
};

export type WebhookServerRuntime = {
  server: Server;
  config: WebhookServerConfig;
  store: InMemoryPullStore;
  app: GitHubApp;
};

export type StartedWebhookServer = WebhookServerRuntime & {
  port: number;
  close: () => Promise<void>;
};

export function createPullRequestDispatcher(options: {
  ingestor: PullRequestIngestor;
  publisher?: GitHubReviewPublisher;
  review?: (input: ReviewInput) => ReviewReport;
}): PullRequestDispatcher {
  const review = options.review ?? reviewPull;
  return async (event) => {
    if (!REVIEWABLE_PULL_ACTIONS.has(event.action)) {
      return;
    }
    const ingested = await options.ingestor.syncWebhook(event);
    if (ingested === undefined || event.draft || options.publisher === undefined) {
      return;
    }
    await options.publisher.publish(ingested, review({ pull: ingested }));
  };
}

export function createGitHubWebhookServer(options: WebhookServerOptions): Server {
  return createServer((req, res) => {
    void handleWebhookRequest(req, res, options).catch(() => {
      if (!res.writableEnded) {
        sendJson(res, 500, { ok: false, error: "Internal server error" });
      }
    });
  });
}

export function createWebhookRuntime(
  env: EnvMap = process.env,
  options: { http?: HttpClient } = {},
): WebhookServerRuntime {
  const config = loadWebhookServerConfig(env);
  const appOptions: GitHubAppOptions = {};
  if (options.http !== undefined) {
    appOptions.http = options.http;
  }
  const app = GitHubApp.fromEnv(env, appOptions);
  const store = new InMemoryPullStore();
  const authorizer = new RepositoryAuthorizer(app, new InMemorySelectionStore());
  const ingestor = new PullRequestIngestor(app, authorizer, store);
  const publisher = new GitHubReviewPublisher(app, authorizer);
  const server = createGitHubWebhookServer({
    handler: new WebhookHandler(config.webhookSecret),
    dispatch: {
      pullRequest: createPullRequestDispatcher({ ingestor, publisher }),
    },
  });
  return { server, config, store, app };
}

export async function startWebhookServerFromEnv(
  env: EnvMap = process.env,
  options: { http?: HttpClient; host?: string; port?: number } = {},
): Promise<StartedWebhookServer> {
  const runtime = createWebhookRuntime(env, options);
  const port = await listenServer(
    runtime.server,
    options.port ?? runtime.config.port,
    options.host ?? "0.0.0.0",
  );
  return { ...runtime, port, close: () => closeServer(runtime.server) };
}

export function listenServer(server: Server, port: number, host = "0.0.0.0"): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      reject(error);
    };
    server.once("error", onError);
    server.listen(port, host, () => {
      server.off("error", onError);
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new GitHubAppError("Webhook server failed to bind a TCP port", "MISSING_CONFIG"));
        return;
      }
      resolve(address.port);
    });
  });
}

export function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error !== undefined) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function handleWebhookRequest(
  req: IncomingMessage,
  res: ServerResponse,
  options: WebhookServerOptions,
): Promise<void> {
  const path = requestPath(req);
  if (path !== GITHUB_WEBHOOK_PATH) {
    sendJson(res, 404, { ok: false, error: "Not found" });
    return;
  }
  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, error: "Method not allowed" });
    return;
  }

  try {
    const rawBody = await readRawBody(req);
    const event = await options.handler.handle(rawBody, requestHeaders(req));
    if (event.type !== "duplicate") {
      await dispatchWebhook(event, options.dispatch);
    }
    sendJson(res, 202, { ok: true, type: event.type });
  } catch (error) {
    if (error instanceof GitHubAppError) {
      sendJson(res, error.status ?? 400, {
        ok: false,
        error: error.message,
        code: error.code,
      });
      return;
    }
    sendJson(res, 500, { ok: false, error: "Internal server error" });
  }
}

async function dispatchWebhook(
  event: ParsedWebhook,
  dispatch: WebhookDispatch | undefined,
): Promise<void> {
  if (event.type === "pull_request") {
    await dispatch?.pullRequest?.(event);
  }
}

function requestPath(req: IncomingMessage): string {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  return url.pathname.replace(/\/+$/, "") || "/";
}

function requestHeaders(req: IncomingMessage): WebhookHeaders {
  const headers: WebhookHeaders = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === "string") {
      headers[key] = value;
    } else if (Array.isArray(value) && value[0] !== undefined) {
      headers[key] = value[0];
    }
  }
  return headers;
}

async function readRawBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}
