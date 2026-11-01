import { afterEach, describe, expect, it } from "vitest";
import { GitHubApp } from "../../src/github/app.js";
import { RepositoryAuthorizer } from "../../src/github/authz.js";
import { InMemorySelectionStore } from "../../src/github/selection.js";
import { signGitHubPayload, WebhookHandler } from "../../src/github/webhooks.js";
import { PullRequestIngestor } from "../../src/review/ingest.js";
import { InMemoryPullStore } from "../../src/review/store.js";
import {
  createGitHubWebhookServer,
  createPullRequestDispatcher,
  createWebhookRuntime,
} from "../../src/server/webhooks.js";
import { MockHttp } from "../helpers/http.js";
import { generateTestAppKeys } from "../helpers/keys.js";
import { listenLocal } from "../helpers/listen.js";

const SECRET = "webhook-secret";
const NOW = 1_700_000_000;

function isoFromNow(offsetSeconds: number): string {
  return new Date((NOW + offsetSeconds) * 1000).toISOString();
}

function signed(body: unknown): { raw: string; signature: string } {
  const raw = JSON.stringify(body);
  return { raw, signature: signGitHubPayload(raw, SECRET) };
}

function pullOpenedPayload(): Record<string, unknown> {
  return {
    action: "opened",
    installation: { id: 9 },
    repository: { full_name: "oktant/demo" },
    pull_request: {
      number: 12,
      title: "Change greet",
      state: "open",
      draft: false,
      html_url: "https://github.com/oktant/demo/pull/12",
      user: { login: "dev" },
      base: { ref: "main", sha: "aaa", repo: { full_name: "oktant/demo" } },
      head: { ref: "feat", sha: "bbb" },
    },
  };
}

function mockGithub(): MockHttp {
  return new MockHttp()
    .on({
      method: "GET",
      urlIncludes: "/app/installations/9",
      body: {
        id: 9,
        account: { id: 1, login: "oktant", type: "Organization" },
        app_id: 4242,
        target_type: "Organization",
        repository_selection: "selected",
        permissions: { contents: "read", metadata: "read", pull_requests: "write" },
        suspended_at: null,
      },
    })
    .on({
      method: "POST",
      urlIncludes: "/app/installations/9/access_tokens",
      body: {
        token: "ghs_pull",
        expires_at: isoFromNow(3600),
        permissions: { contents: "read", metadata: "read", pull_requests: "write" },
        repository_selection: "selected",
      },
    })
    .on({
      method: "GET",
      urlIncludes: "/repos/oktant/demo/pulls/12/files",
      body: [
        {
          filename: "src/greet.ts",
          status: "modified",
          additions: 1,
          deletions: 1,
          patch:
            "@@ -1,1 +1,1 @@\n-export function greet() { return 1; }\n+export function greet() { return 2; }",
        },
      ],
    })
    .on({
      method: "GET",
      urlIncludes: "/repos/oktant/demo/pulls/12/commits",
      body: [{ sha: "bbb", commit: { message: "change greet", author: { name: "dev" } } }],
    })
    .on({
      method: "GET",
      urlIncludes: "/repos/oktant/demo/pulls/12",
      body: {
        number: 12,
        title: "Change greet",
        body: "return 2",
        state: "open",
        draft: false,
        html_url: "https://github.com/oktant/demo/pull/12",
        updated_at: "2023-11-14T22:13:20Z",
        user: { login: "dev" },
        base: { ref: "main", sha: "aaa", repo: { full_name: "oktant/demo" } },
        head: { ref: "feat", sha: "bbb" },
      },
    })
    .on({
      method: "POST",
      urlIncludes: "/repos/oktant/demo/pulls/12/reviews",
      body: { id: 88, html_url: "https://github.com/oktant/demo/pull/12#review-88" },
    })
    .on({
      method: "GET",
      urlIncludes: "/repos/oktant/demo",
      body: {
        id: 1,
        name: "demo",
        full_name: "oktant/demo",
        owner: { login: "oktant" },
        private: true,
        fork: false,
        archived: false,
        disabled: false,
        default_branch: "main",
        language: "TypeScript",
        visibility: "private",
        html_url: "https://github.com/oktant/demo",
        clone_url: "https://github.com/oktant/demo.git",
        size: 10,
      },
    });
}

async function postWebhook(
  url: string,
  raw: string,
  headers: Record<string, string>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`${url}/webhooks/github`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: raw,
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

describe("GitHub webhook HTTP server", () => {
  const closers: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (closers.length > 0) {
      const close = closers.pop();
      if (close !== undefined) {
        await close();
      }
    }
  });

  it("accepts a valid signature and returns 202", async () => {
    const { raw, signature } = signed({ zen: "Keep it logically awesome." });
    const listening = await listenLocal(
      createGitHubWebhookServer({ handler: new WebhookHandler(SECRET) }),
    );
    closers.push(listening.close);

    const result = await postWebhook(listening.url, raw, {
      "X-GitHub-Event": "ping",
      "X-GitHub-Delivery": "del-ok",
      "X-Hub-Signature-256": signature,
    });

    expect(result.status).toBe(202);
    expect(result.body).toEqual({ ok: true, type: "ping" });
  });

  it("rejects an invalid signature with 401", async () => {
    const { raw } = signed({ zen: "nope" });
    const listening = await listenLocal(
      createGitHubWebhookServer({ handler: new WebhookHandler(SECRET) }),
    );
    closers.push(listening.close);

    const result = await postWebhook(listening.url, raw, {
      "X-GitHub-Event": "ping",
      "X-GitHub-Delivery": "del-bad",
      "X-Hub-Signature-256": "sha256=deadbeef",
    });

    expect(result.status).toBe(401);
    expect(result.body.code).toBe("INVALID_WEBHOOK_SIGNATURE");
  });

  it("ignores a duplicate delivery id and does not dispatch again", async () => {
    const { raw, signature } = signed(pullOpenedPayload());
    const deliveries: string[] = [];
    const listening = await listenLocal(
      createGitHubWebhookServer({
        handler: new WebhookHandler(SECRET),
        dispatch: {
          pullRequest: async (event) => {
            deliveries.push(event.deliveryId);
          },
        },
      }),
    );
    closers.push(listening.close);

    const headers = {
      "X-GitHub-Event": "pull_request",
      "X-GitHub-Delivery": "del-dup",
      "X-Hub-Signature-256": signature,
    };
    const first = await postWebhook(listening.url, raw, headers);
    const second = await postWebhook(listening.url, raw, headers);

    expect(first.status).toBe(202);
    expect(first.body.type).toBe("pull_request");
    expect(second.status).toBe(202);
    expect(second.body.type).toBe("duplicate");
    expect(deliveries).toEqual(["del-dup"]);
  });

  it("ingests a pull_request.opened delivery", async () => {
    const http = mockGithub();
    const keys = generateTestAppKeys();
    const env = {
      GITHUB_APP_ID: "4242",
      GITHUB_APP_PRIVATE_KEY: keys.privateKeyPkcs8,
      GITHUB_APP_WEBHOOK_SECRET: SECRET,
    };
    const app = GitHubApp.fromEnv(env, {
      http,
      clock: { nowSeconds: () => NOW, now: () => new Date(NOW * 1000) },
    });
    const store = new InMemoryPullStore();
    const ingestor = new PullRequestIngestor(
      app,
      new RepositoryAuthorizer(app, new InMemorySelectionStore()),
      store,
      { clock: { nowSeconds: () => NOW, now: () => new Date(NOW * 1000) } },
    );
    const listening = await listenLocal(
      createGitHubWebhookServer({
        handler: new WebhookHandler(SECRET),
        dispatch: {
          pullRequest: createPullRequestDispatcher({
            ingestor,
            review: () => {
              throw new Error("review should not run without a publisher");
            },
          }),
        },
      }),
    );
    closers.push(listening.close);

    const { raw, signature } = signed(pullOpenedPayload());
    const result = await postWebhook(listening.url, raw, {
      "X-GitHub-Event": "pull_request",
      "X-GitHub-Delivery": "del-opened",
      "X-Hub-Signature-256": signature,
    });

    expect(result.status).toBe(202);
    expect(result.body.type).toBe("pull_request");
    const ingested = await store.get("oktant/demo", 12);
    expect(ingested?.pull.title).toBe("Change greet");
    expect(ingested?.files[0]?.path).toBe("src/greet.ts");
  });

  it("wires env config into a runtime that reviews opened pulls", async () => {
    const http = mockGithub();
    const keys = generateTestAppKeys();
    const runtime = createWebhookRuntime(
      {
        GITHUB_APP_ID: "4242",
        GITHUB_APP_PRIVATE_KEY: keys.privateKeyPkcs8,
        GITHUB_APP_WEBHOOK_SECRET: SECRET,
        CODEHOUND_PORT: "0",
      },
      { http },
    );
    const listening = await listenLocal(runtime.server);
    closers.push(listening.close);

    const { raw, signature } = signed(pullOpenedPayload());
    const result = await postWebhook(listening.url, raw, {
      "X-GitHub-Event": "pull_request",
      "X-GitHub-Delivery": "del-runtime",
      "X-Hub-Signature-256": signature,
    });

    expect(result.status).toBe(202);
    expect((await runtime.store.get("oktant/demo", 12))?.pull.number).toBe(12);
    expect(http.calls.some((call) => call.method === "POST" && call.url.includes("/reviews"))).toBe(
      true,
    );
  });
});
