import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GitHubApp } from "../../src/github/app.js";
import { RepositoryAuthorizer } from "../../src/github/authz.js";
import { IncrementalIngestor } from "../../src/github/incremental.js";
import { InMemorySelectionStore } from "../../src/github/selection.js";
import { BranchTracker, InMemoryRefStore } from "../../src/github/tracking.js";
import { commitOriginFile, createOriginRepository } from "../helpers/git-origin.js";
import type { HttpClient, HttpRequest, HttpResponse } from "../../src/github/http.js";
import { generateTestAppKeys } from "../helpers/keys.js";

const NOW = 1_700_000_000;

function isoFromNow(offsetSeconds: number): string {
  return new Date((NOW + offsetSeconds) * 1000).toISOString();
}

function json(body: unknown): HttpResponse {
  return {
    status: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

function createGithub(cloneUrl: string, headSha: { value: string }): HttpClient {
  return {
    async request(req: HttpRequest): Promise<HttpResponse> {
      if (
        req.method === "GET" &&
        req.url.includes("/app/installations/9") &&
        !req.url.includes("access_tokens")
      ) {
        return json({
          id: 9,
          account: { id: 1, login: "oktant", type: "Organization" },
          app_id: 4242,
          target_type: "Organization",
          repository_selection: "selected",
          permissions: { contents: "read", metadata: "read" },
          suspended_at: null,
        });
      }
      if (req.method === "POST" && req.url.includes("/app/installations/9/access_tokens")) {
        return json({
          token: "ghs_incremental",
          expires_at: isoFromNow(3600),
          permissions: { contents: "read", metadata: "read" },
          repository_selection: "selected",
        });
      }
      if (req.method === "GET" && req.url.includes("/repos/oktant/demo/branches")) {
        return json({
          name: "main",
          protected: false,
          commit: { sha: headSha.value },
        });
      }
      if (req.method === "GET" && req.url.includes("/repos/oktant/demo/commits")) {
        return json([
          {
            sha: headSha.value,
            html_url: `https://github.com/oktant/demo/commit/${headSha.value}`,
            commit: {
              message: "head",
              author: { name: "dev", email: "dev@example.com", date: isoFromNow(0) },
              committer: { name: "dev", email: "dev@example.com", date: isoFromNow(0) },
            },
            parents: [],
          },
        ]);
      }
      if (req.method === "GET" && req.url.includes("/repos/oktant/demo")) {
        return json({
          id: 55,
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
          clone_url: cloneUrl,
          size: 1,
        });
      }
      return {
        status: 404,
        headers: {},
        body: JSON.stringify({ message: `No mock for ${req.method} ${req.url}` }),
      };
    },
  };
}

async function setup(cloneUrl: string, headSha: { value: string }) {
  const app = GitHubApp.fromEnv(
    {
      GITHUB_APP_ID: "4242",
      GITHUB_APP_PRIVATE_KEY: generateTestAppKeys().privateKeyPkcs8,
    },
    {
      http: createGithub(cloneUrl, headSha),
      clock: { nowSeconds: () => NOW, now: () => new Date(NOW * 1000) },
    },
  );
  const selections = new InMemorySelectionStore();
  const authorizer = new RepositoryAuthorizer(app, selections);
  const tracker = new BranchTracker(app, authorizer, new InMemoryRefStore(), {
    clock: { nowSeconds: () => NOW, now: () => new Date(NOW * 1000) },
  });
  const rootDir = await mkdtemp(join(tmpdir(), "codehound-incremental-"));
  const ingestor = new IncrementalIngestor(app, authorizer, {
    tracker,
    rootDir,
    clock: { nowSeconds: () => NOW, now: () => new Date(NOW * 1000) },
  });
  await selections.add({
    installationId: 9,
    fullName: "oktant/demo",
    owner: "oktant",
    name: "demo",
    selectedAt: isoFromNow(0),
  });
  return { ingestor, tracker, rootDir };
}

describe("IncrementalIngestor", () => {
  it("does a full clone then fast-forwards new commits", async () => {
    const origin = await createOriginRepository();
    const headSha = { value: origin.sha };
    const { ingestor } = await setup(origin.path, headSha);

    const first = await ingestor.ingest({ installationId: 9, fullName: "oktant/demo" });
    expect(first.action).toBe("full");
    expect(first.snapshot.commitSha).toBe(origin.sha);
    expect(first.snapshot.files.map((file) => file.path)).toEqual(["README.md", "src/index.ts"]);

    const nextSha = await commitOriginFile(
      origin.path,
      "src/util.ts",
      "export const k = 2;\n",
      "add util",
    );
    headSha.value = nextSha;

    const second = await ingestor.ingest({ installationId: 9, fullName: "oktant/demo" });
    expect(second.action).toBe("incremental");
    expect(second.previousSha).toBe(origin.sha);
    expect(second.snapshot.commitSha).toBe(nextSha);
    expect(second.changedFiles).toContain("src/util.ts");
    expect(second.snapshot.files.map((file) => file.path)).toEqual([
      "README.md",
      "src/index.ts",
      "src/util.ts",
    ]);

    const third = await ingestor.ingest({
      installationId: 9,
      fullName: "oktant/demo",
      targetSha: nextSha,
    });
    expect(third.action).toBe("skipped");
    expect(third.snapshot.commitSha).toBe(nextSha);
  });

  it("ingests from a push webhook using the after SHA", async () => {
    const origin = await createOriginRepository();
    const headSha = { value: origin.sha };
    const { ingestor } = await setup(origin.path, headSha);
    await ingestor.ingest({ installationId: 9, fullName: "oktant/demo" });

    const nextSha = await commitOriginFile(origin.path, "CHANGELOG.md", "notes\n", "changelog");
    headSha.value = nextSha;

    const result = await ingestor.ingestFromWebhook({
      type: "push",
      deliveryId: "del-push",
      installationId: 9,
      fullName: "oktant/demo",
      ref: "refs/heads/main",
      branch: "main",
      before: origin.sha,
      after: nextSha,
      created: false,
      deleted: false,
      forced: false,
      compareUrl: undefined,
      cloneUrl: origin.path,
      defaultBranch: "main",
      commits: [
        {
          sha: nextSha,
          message: "changelog",
          authorName: "dev",
          authorEmail: "dev@example.com",
          committedAt: isoFromNow(0),
          parents: [origin.sha],
          htmlUrl: `https://github.com/oktant/demo/commit/${nextSha}`,
        },
      ],
    });
    expect(result.action).toBe("incremental");
    if (result.action === "incremental") {
      expect(result.snapshot.commitSha).toBe(nextSha);
      expect(result.changedFiles).toContain("CHANGELOG.md");
    }
  });

  it("treats a deleted-branch webhook as deleted", async () => {
    const origin = await createOriginRepository();
    const { ingestor } = await setup(origin.path, { value: origin.sha });
    const result = await ingestor.ingestFromWebhook({
      type: "delete",
      deliveryId: "del-branch",
      installationId: 9,
      fullName: "oktant/demo",
      ref: "feature",
      refType: "branch",
    });
    expect(result).toEqual({ action: "deleted", fullName: "oktant/demo", branch: "feature" });
  });

  it("ignores ping webhooks", async () => {
    const origin = await createOriginRepository();
    const { ingestor } = await setup(origin.path, { value: origin.sha });
    const result = await ingestor.ingestFromWebhook({
      type: "ping",
      deliveryId: "del-ping",
      zen: "Keep it simple.",
    });
    expect(result.action).toBe("ignored");
  });

  it("force-pushes fall back to a full clone", async () => {
    const origin = await createOriginRepository();
    const headSha = { value: origin.sha };
    const { ingestor } = await setup(origin.path, headSha);
    await ingestor.ingest({ installationId: 9, fullName: "oktant/demo" });
    const nextSha = await commitOriginFile(origin.path, "forced.txt", "x\n", "force");
    headSha.value = nextSha;
    const result = await ingestor.ingest({
      installationId: 9,
      fullName: "oktant/demo",
      targetSha: nextSha,
      forced: true,
    });
    expect(result.action).toBe("full");
    expect(result.reason).toBe("fell back to full clone");
    expect(result.snapshot.commitSha).toBe(nextSha);
  });
});
