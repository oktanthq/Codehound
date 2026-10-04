import { describe, expect, it } from "vitest";
import { GitHubAppError } from "../../src/github/errors.js";
import type { IncrementalIngestResult, WebhookIngestResult } from "../../src/github/incremental.js";
import type { IngestRequest, IngestSnapshot } from "../../src/github/ingest.js";
import {
  delayForAttempt,
  InMemoryIngestJobStore,
  isRetryableIngestError,
  RetryingIncrementalIngestor,
  RetryingIngestor,
} from "../../src/github/retry.js";
import type { ParsedWebhook } from "../../src/github/webhooks.js";

const NOW = 1_700_000_000;

function clock() {
  return { nowSeconds: () => NOW, now: () => new Date(NOW * 1000) };
}

function snapshot(): IngestSnapshot {
  return {
    installationId: 9,
    repository: {
      id: 55,
      name: "demo",
      fullName: "oktant/demo",
      owner: "oktant",
      private: true,
      fork: false,
      archived: false,
      disabled: false,
      defaultBranch: "main",
      language: "TypeScript",
      visibility: "private",
      htmlUrl: "https://github.com/oktant/demo",
      cloneUrl: "https://github.com/oktant/demo.git",
      size: 1,
    },
    ref: "main",
    commitSha: "abc",
    ingestedAt: new Date(NOW * 1000).toISOString(),
    worktreePath: "/tmp/demo",
    fileCount: 1,
    byteSize: 10,
    languages: [{ language: "TypeScript", fileCount: 1, byteSize: 10 }],
    primaryLanguage: "TypeScript",
    files: [{ path: "src/index.ts", size: 10, language: "TypeScript", kind: "source" }],
  };
}

describe("isRetryableIngestError", () => {
  it("retries clone and server failures, not authz or 4xx", () => {
    expect(isRetryableIngestError(new GitHubAppError("clone", "CLONE_FAILED"))).toBe(true);
    expect(isRetryableIngestError(new GitHubAppError("git", "GIT_FAILED"))).toBe(true);
    expect(isRetryableIngestError(new GitHubAppError("down", "GITHUB_HTTP_ERROR", 502))).toBe(true);
    expect(isRetryableIngestError(new GitHubAppError("rate", "GITHUB_HTTP_ERROR", 429))).toBe(true);
    expect(isRetryableIngestError(new GitHubAppError("missing", "GITHUB_HTTP_ERROR", 404))).toBe(
      false,
    );
    expect(isRetryableIngestError(new GitHubAppError("nope", "REPOSITORY_NOT_SELECTED"))).toBe(
      false,
    );
    expect(isRetryableIngestError(new Error("boom"))).toBe(false);
  });
});

describe("delayForAttempt", () => {
  it("caps exponential backoff", () => {
    const policy = { maxAttempts: 5, initialDelayMs: 100, maxDelayMs: 250, multiplier: 2 };
    expect(delayForAttempt(policy, 1)).toBe(100);
    expect(delayForAttempt(policy, 2)).toBe(200);
    expect(delayForAttempt(policy, 3)).toBe(250);
  });
});

describe("RetryingIngestor", () => {
  it("records a successful first attempt", async () => {
    const jobs = new InMemoryIngestJobStore();
    const delays: number[] = [];
    const inner = {
      ingest: async () => snapshot(),
    };
    const retrying = new RetryingIngestor(inner, {
      jobs,
      clock: clock(),
      sleep: async (ms) => {
        delays.push(ms);
      },
      policy: { maxAttempts: 3, initialDelayMs: 10, maxDelayMs: 100, multiplier: 2 },
    });

    const result = await retrying.ingest({
      installationId: 9,
      fullName: "oktant/demo",
      ref: "main",
    });
    const job = await jobs.getLatest(9, "oktant/demo", "main");

    expect(result.commitSha).toBe("abc");
    expect(job?.status).toBe("succeeded");
    expect(job?.attempts).toHaveLength(1);
    expect(delays).toEqual([]);
  });

  it("retries retryable failures then succeeds", async () => {
    const jobs = new InMemoryIngestJobStore();
    const delays: number[] = [];
    let calls = 0;
    const inner = {
      ingest: async () => {
        calls += 1;
        if (calls < 3) {
          throw new GitHubAppError("clone failed", "CLONE_FAILED");
        }
        return snapshot();
      },
    };
    const retrying = new RetryingIngestor(inner, {
      jobs,
      clock: clock(),
      sleep: async (ms) => {
        delays.push(ms);
      },
      policy: { maxAttempts: 3, initialDelayMs: 10, maxDelayMs: 100, multiplier: 2 },
    });

    await retrying.ingest({ installationId: 9, fullName: "oktant/demo" });
    const job = await jobs.getLatest(9, "oktant/demo", undefined);

    expect(calls).toBe(3);
    expect(delays).toEqual([10, 20]);
    expect(job?.status).toBe("succeeded");
    expect(job?.attempts.map((item) => item.errorCode)).toEqual([
      "CLONE_FAILED",
      "CLONE_FAILED",
      undefined,
    ]);
  });

  it("does not retry authorization failures", async () => {
    let calls = 0;
    const jobs = new InMemoryIngestJobStore();
    const inner = {
      ingest: async () => {
        calls += 1;
        throw new GitHubAppError("not selected", "REPOSITORY_NOT_SELECTED");
      },
    };
    const retrying = new RetryingIngestor(inner, {
      jobs,
      clock: clock(),
      sleep: async () => {
        throw new Error("should not sleep");
      },
      policy: { maxAttempts: 4, initialDelayMs: 10, maxDelayMs: 100, multiplier: 2 },
    });

    await expect(
      retrying.ingest({ installationId: 9, fullName: "oktant/demo" }),
    ).rejects.toMatchObject({ code: "REPOSITORY_NOT_SELECTED" });
    expect(calls).toBe(1);
    expect((await jobs.getLatest(9, "oktant/demo", undefined))?.status).toBe("failed");
  });

  it("stops after the policy is exhausted", async () => {
    let calls = 0;
    const jobs = new InMemoryIngestJobStore();
    const inner = {
      ingest: async (_request: IngestRequest) => {
        calls += 1;
        throw new GitHubAppError("clone failed", "CLONE_FAILED");
      },
    };
    const retrying = new RetryingIngestor(inner, {
      jobs,
      clock: clock(),
      sleep: async () => undefined,
      policy: { maxAttempts: 3, initialDelayMs: 0, maxDelayMs: 0, multiplier: 2 },
    });

    await expect(
      retrying.ingest({ installationId: 9, fullName: "oktant/demo" }),
    ).rejects.toMatchObject({ code: "CLONE_FAILED" });
    expect(calls).toBe(3);
    const job = await jobs.getLatest(9, "oktant/demo", undefined);
    expect(job?.status).toBe("failed");
    expect(job?.attempts).toHaveLength(3);
  });
});

describe("RetryingIncrementalIngestor", () => {
  it("retries ingestFromWebhook for push events", async () => {
    let calls = 0;
    const jobs = new InMemoryIngestJobStore();
    const success: IncrementalIngestResult = {
      action: "full",
      reason: "no previous ingest",
      snapshot: snapshot(),
      changedFiles: ["src/index.ts"],
      previousSha: undefined,
    };
    const inner = {
      ingest: async () => success,
      ingestFromWebhook: async (): Promise<WebhookIngestResult> => {
        calls += 1;
        if (calls === 1) {
          throw new GitHubAppError("clone failed", "CLONE_FAILED");
        }
        return success;
      },
    };
    const retrying = new RetryingIncrementalIngestor(inner, {
      jobs,
      clock: clock(),
      sleep: async () => undefined,
      policy: { maxAttempts: 3, initialDelayMs: 0, maxDelayMs: 0, multiplier: 2 },
    });
    const event: ParsedWebhook = {
      type: "push",
      deliveryId: "d1",
      installationId: 9,
      fullName: "oktant/demo",
      ref: "refs/heads/main",
      branch: "main",
      before: "0".repeat(40),
      after: "abc",
      created: true,
      deleted: false,
      forced: false,
      compareUrl: undefined,
      cloneUrl: undefined,
      defaultBranch: "main",
      commits: [],
    };

    const result = await retrying.ingestFromWebhook(event);
    expect(result).toEqual(success);
    expect(calls).toBe(2);
    expect((await jobs.getLatest(9, "oktant/demo", "main"))?.status).toBe("succeeded");
  });

  it("does not retry ignored webhook events", async () => {
    let calls = 0;
    const inner = {
      ingest: async () => {
        throw new Error("unused");
      },
      ingestFromWebhook: async (event: ParsedWebhook): Promise<WebhookIngestResult> => {
        calls += 1;
        return { action: "ignored", event };
      },
    };
    const retrying = new RetryingIncrementalIngestor(inner, {
      clock: clock(),
      sleep: async () => {
        throw new Error("should not sleep");
      },
    });
    const event: ParsedWebhook = { type: "ping", deliveryId: "d2", zen: "ok" };
    await expect(retrying.ingestFromWebhook(event)).resolves.toEqual({
      action: "ignored",
      event,
    });
    expect(calls).toBe(1);
  });
});
