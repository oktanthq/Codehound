import { describe, expect, it } from "vitest";
import { GitHubAppError } from "../../src/github/errors.js";
import { BranchTracker, InMemoryRefStore, ZERO_SHA } from "../../src/github/tracking.js";
import {
  applyWebhookToTracker,
  signGitHubPayload,
  WebhookHandler,
} from "../../src/github/webhooks.js";
import { GitHubApp } from "../../src/github/app.js";
import { RepositoryAuthorizer } from "../../src/github/authz.js";
import { InMemorySelectionStore } from "../../src/github/selection.js";
import { MockHttp } from "../helpers/http.js";
import { generateTestAppKeys } from "../helpers/keys.js";

const SECRET = "webhook-secret";

function signed(body: unknown): { raw: string; signature: string } {
  const raw = JSON.stringify(body);
  return { raw, signature: signGitHubPayload(raw, SECRET) };
}

function handler(): WebhookHandler {
  return new WebhookHandler(SECRET);
}

function tracker(): BranchTracker {
  const app = GitHubApp.fromEnv(
    {
      GITHUB_APP_ID: "4242",
      GITHUB_APP_PRIVATE_KEY: generateTestAppKeys().privateKeyPkcs8,
    },
    { http: new MockHttp() },
  );
  return new BranchTracker(
    app,
    new RepositoryAuthorizer(app, new InMemorySelectionStore()),
    new InMemoryRefStore(),
  );
}

describe("WebhookHandler", () => {
  it("parses a signed ping event", async () => {
    const { raw, signature } = signed({ zen: "Design for failure." });
    const parsed = await handler().handle(raw, {
      "X-GitHub-Event": "ping",
      "X-GitHub-Delivery": "del-1",
      "X-Hub-Signature-256": signature,
    });
    expect(parsed).toMatchObject({ type: "ping", deliveryId: "del-1", zen: "Design for failure." });
  });

  it("rejects an invalid signature", async () => {
    const { raw } = signed({ zen: "nope" });
    await expect(
      handler().handle(raw, {
        "x-github-event": "ping",
        "x-github-delivery": "del-2",
        "x-hub-signature-256": "sha256:deadbeef",
      }),
    ).rejects.toMatchObject({ code: "INVALID_WEBHOOK_SIGNATURE", status: 401 });
  });

  it("parses a push event for a branch", async () => {
    const { raw, signature } = signed({
      ref: "refs/heads/main",
      before: "aaa111",
      after: "bbb222",
      created: false,
      deleted: false,
      forced: false,
      compare: "https://github.com/oktant/demo/compare/aaa111...bbb222",
      commits: [
        {
          id: "bbb222",
          message: "fix n",
          timestamp: "2023-11-14T22:13:20Z",
          url: "https://github.com/oktant/demo/commit/bbb222",
          author: { name: "dev", email: "dev@example.com" },
        },
      ],
      repository: {
        full_name: "oktant/demo",
        default_branch: "main",
        clone_url: "https://github.com/oktant/demo.git",
      },
      installation: { id: 9 },
    });
    const parsed = await handler().handle(raw, {
      "x-github-event": "push",
      "x-github-delivery": "del-3",
      "x-hub-signature-256": signature,
    });
    expect(parsed.type).toBe("push");
    if (parsed.type === "push") {
      expect(parsed.branch).toBe("main");
      expect(parsed.installationId).toBe(9);
      expect(parsed.commits[0]?.sha).toBe("bbb222");
      expect(parsed.forced).toBe(false);
    }
  });

  it("returns duplicate for a repeated delivery id", async () => {
    const { raw, signature } = signed({ zen: "repeat" });
    const webhooks = handler();
    const headers = {
      "x-github-event": "ping",
      "x-github-delivery": "del-dup",
      "x-hub-signature-256": signature,
    };
    expect((await webhooks.handle(raw, headers)).type).toBe("ping");
    expect(await webhooks.handle(raw, headers)).toMatchObject({
      type: "duplicate",
      deliveryId: "del-dup",
    });
  });

  it("parses installation repository changes", async () => {
    const { raw, signature } = signed({
      action: "added",
      installation: { id: 9 },
      repositories_added: [{ full_name: "oktant/demo" }],
      repositories_removed: [{ full_name: "oktant/old" }],
    });
    const parsed = await handler().handle(raw, {
      "x-github-event": "installation_repositories",
      "x-github-delivery": "del-4",
      "x-hub-signature-256": signature,
    });
    expect(parsed).toMatchObject({
      type: "installation_repositories",
      action: "added",
      added: ["oktant/demo"],
      removed: ["oktant/old"],
    });
  });

  it("rejects missing webhook secret", () => {
    expect(() => new WebhookHandler("")).toThrow(GitHubAppError);
  });

  it("rejects invalid JSON", async () => {
    const raw = "{not json";
    const signature = signGitHubPayload(raw, SECRET);
    await expect(
      handler().handle(raw, {
        "x-github-event": "ping",
        "x-github-delivery": "del-5",
        "x-hub-signature-256": signature,
      }),
    ).rejects.toMatchObject({ code: "INVALID_WEBHOOK_PAYLOAD" });
  });
});

describe("applyWebhookToTracker", () => {
  it("records a push and removes a deleted branch", async () => {
    const refs = tracker();
    const push = {
      type: "push" as const,
      deliveryId: "d1",
      installationId: 9,
      fullName: "oktant/demo",
      ref: "refs/heads/main",
      branch: "main",
      before: ZERO_SHA,
      after: "abc",
      created: true,
      deleted: false,
      forced: false,
      compareUrl: undefined,
      cloneUrl: undefined,
      defaultBranch: "main",
      commits: [
        {
          sha: "abc",
          message: "init",
          authorName: "dev",
          authorEmail: "dev@example.com",
          committedAt: "2023-11-14T22:13:20Z",
          parents: [],
          htmlUrl: "https://example.com/abc",
        },
      ],
    };
    await applyWebhookToTracker(refs, push);
    expect((await refs.getBranch(9, "oktant/demo", "main"))?.commitSha).toBe("abc");

    await applyWebhookToTracker(refs, {
      type: "delete",
      deliveryId: "d2",
      installationId: 9,
      fullName: "oktant/demo",
      ref: "main",
      refType: "branch",
    });
    expect(await refs.getBranch(9, "oktant/demo", "main")).toBeUndefined();
  });

  it("ignores tag pushes", async () => {
    const refs = tracker();
    await applyWebhookToTracker(refs, {
      type: "push",
      deliveryId: "d3",
      installationId: 9,
      fullName: "oktant/demo",
      ref: "refs/tags/v1",
      branch: undefined,
      before: ZERO_SHA,
      after: "abc",
      created: true,
      deleted: false,
      forced: false,
      compareUrl: undefined,
      cloneUrl: undefined,
      defaultBranch: "main",
      commits: [],
    });
    expect(await refs.listBranches(9, "oktant/demo")).toEqual([]);
  });
});
