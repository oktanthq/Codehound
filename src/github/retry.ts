import { systemClock, type Clock } from "./clock.js";
import { GitHubAppError } from "./errors.js";
import type {
  IncrementalIngestor,
  IncrementalIngestResult,
  WebhookIngestResult,
} from "./incremental.js";
import type { IngestRequest, IngestSnapshot, RepositoryIngestor } from "./ingest.js";
import { parseRepositoryFullName } from "./types.js";
import type { ParsedWebhook } from "./webhooks.js";

export type RetryPolicy = {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  multiplier: number;
};

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  initialDelayMs: 250,
  maxDelayMs: 4000,
  multiplier: 2,
};

export type Sleeper = (ms: number) => Promise<void>;

export const systemSleep: Sleeper = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export type IngestJobStatus = "running" | "succeeded" | "failed";

export type IngestJobAttempt = {
  attempt: number;
  startedAt: string;
  finishedAt: string;
  errorCode: string | undefined;
  errorMessage: string | undefined;
};

export type IngestJob = {
  id: string;
  installationId: number;
  fullName: string;
  ref: string | undefined;
  status: IngestJobStatus;
  attempts: IngestJobAttempt[];
  createdAt: string;
  updatedAt: string;
};

export type IngestJobStore = {
  upsert: (job: IngestJob) => Promise<IngestJob>;
  get: (id: string) => Promise<IngestJob | undefined>;
  getLatest: (
    installationId: number,
    fullName: string,
    ref: string | undefined,
  ) => Promise<IngestJob | undefined>;
  list: (installationId: number, fullName: string) => Promise<IngestJob[]>;
};

const RETRYABLE_CODES = new Set([
  "CLONE_FAILED",
  "INGEST_FAILED",
  "GIT_FAILED",
  "GITHUB_HTTP_ERROR",
]);

export function isRetryableIngestError(error: unknown): boolean {
  if (!(error instanceof GitHubAppError)) {
    return false;
  }
  if (error.status === 429) {
    return true;
  }
  if (error.status !== undefined && error.status >= 400 && error.status < 500) {
    return false;
  }
  if (error.status !== undefined && error.status >= 500) {
    return true;
  }
  return RETRYABLE_CODES.has(error.code);
}

export function delayForAttempt(policy: RetryPolicy, failedAttempt: number): number {
  const delay = policy.initialDelayMs * policy.multiplier ** (failedAttempt - 1);
  return Math.min(delay, policy.maxDelayMs);
}

export function ingestJobId(
  installationId: number,
  fullName: string,
  ref: string | undefined,
): string {
  return `${installationId}:${fullName.toLowerCase()}:${(ref ?? "").toLowerCase()}`;
}

function jobKey(installationId: number, fullName: string, ref: string | undefined): string {
  return ingestJobId(installationId, fullName, ref);
}

export class InMemoryIngestJobStore implements IngestJobStore {
  private readonly jobs = new Map<string, IngestJob>();

  async upsert(job: IngestJob): Promise<IngestJob> {
    this.jobs.set(jobKey(job.installationId, job.fullName, job.ref), job);
    return job;
  }

  async get(id: string): Promise<IngestJob | undefined> {
    return [...this.jobs.values()].find((job) => job.id === id);
  }

  async getLatest(
    installationId: number,
    fullName: string,
    ref: string | undefined,
  ): Promise<IngestJob | undefined> {
    return this.jobs.get(jobKey(installationId, fullName, ref));
  }

  async list(installationId: number, fullName: string): Promise<IngestJob[]> {
    const normalized = fullName.toLowerCase();
    return [...this.jobs.values()]
      .filter(
        (job) => job.installationId === installationId && job.fullName.toLowerCase() === normalized,
      )
      .sort((a, b) => a.id.localeCompare(b.id));
  }
}

export type RetryContext = {
  installationId: number;
  fullName: string;
  ref: string | undefined;
};

export type RunWithRetryOptions = {
  policy?: RetryPolicy;
  clock?: Clock;
  sleep?: Sleeper;
  jobs?: IngestJobStore;
};

function resolveFullName(request: IngestRequest): string {
  if (request.fullName !== undefined) {
    const parsed = parseRepositoryFullName(request.fullName);
    return `${parsed.owner}/${parsed.name}`;
  }
  if (request.owner !== undefined && request.repo !== undefined) {
    return `${request.owner}/${request.repo}`;
  }
  return "unknown/unknown";
}

export async function runWithRetry<T>(
  operation: () => Promise<T>,
  context: RetryContext,
  options: RunWithRetryOptions = {},
): Promise<T> {
  const policy = options.policy ?? DEFAULT_RETRY_POLICY;
  const clock = options.clock ?? systemClock;
  const sleep = options.sleep ?? systemSleep;
  const jobs = options.jobs ?? new InMemoryIngestJobStore();
  const createdAt = clock.now().toISOString();
  let job: IngestJob = {
    id: ingestJobId(context.installationId, context.fullName, context.ref),
    installationId: context.installationId,
    fullName: context.fullName,
    ref: context.ref,
    status: "running",
    attempts: [],
    createdAt,
    updatedAt: createdAt,
  };
  await jobs.upsert(job);

  const maxAttempts = Math.max(1, policy.maxAttempts);
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const startedAt = clock.now().toISOString();
    try {
      const result = await operation();
      const finishedAt = clock.now().toISOString();
      job = {
        ...job,
        status: "succeeded",
        updatedAt: finishedAt,
        attempts: [
          ...job.attempts,
          {
            attempt,
            startedAt,
            finishedAt,
            errorCode: undefined,
            errorMessage: undefined,
          },
        ],
      };
      await jobs.upsert(job);
      return result;
    } catch (error) {
      const finishedAt = clock.now().toISOString();
      lastError = error;
      const errorCode = error instanceof GitHubAppError ? error.code : "INGEST_FAILED";
      const errorMessage = error instanceof Error ? error.message : "ingest failed";
      job = {
        ...job,
        status: "failed",
        updatedAt: finishedAt,
        attempts: [
          ...job.attempts,
          {
            attempt,
            startedAt,
            finishedAt,
            errorCode,
            errorMessage,
          },
        ],
      };
      await jobs.upsert(job);
      const canRetry = attempt < maxAttempts && isRetryableIngestError(error);
      if (!canRetry) {
        throw error;
      }
      const delay = delayForAttempt(policy, attempt);
      if (delay > 0) {
        await sleep(delay);
      }
    }
  }
  throw lastError;
}

export type RetryingIngestorOptions = RunWithRetryOptions;

export class RetryingIngestor {
  readonly jobs: IngestJobStore;
  private readonly policy: RetryPolicy;
  private readonly clock: Clock;
  private readonly sleep: Sleeper;

  constructor(
    private readonly inner: Pick<RepositoryIngestor, "ingest">,
    options: RetryingIngestorOptions = {},
  ) {
    this.jobs = options.jobs ?? new InMemoryIngestJobStore();
    this.policy = options.policy ?? DEFAULT_RETRY_POLICY;
    this.clock = options.clock ?? systemClock;
    this.sleep = options.sleep ?? systemSleep;
  }

  async ingest(request: IngestRequest): Promise<IngestSnapshot> {
    return runWithRetry(() => this.inner.ingest(request), this.contextFromRequest(request), {
      policy: this.policy,
      clock: this.clock,
      sleep: this.sleep,
      jobs: this.jobs,
    });
  }

  private contextFromRequest(request: IngestRequest): RetryContext {
    return {
      installationId: request.installationId,
      fullName: resolveFullName(request),
      ref: request.ref,
    };
  }
}

export class RetryingIncrementalIngestor {
  readonly jobs: IngestJobStore;
  private readonly policy: RetryPolicy;
  private readonly clock: Clock;
  private readonly sleep: Sleeper;

  constructor(
    private readonly inner: Pick<IncrementalIngestor, "ingest" | "ingestFromWebhook">,
    options: RetryingIngestorOptions = {},
  ) {
    this.jobs = options.jobs ?? new InMemoryIngestJobStore();
    this.policy = options.policy ?? DEFAULT_RETRY_POLICY;
    this.clock = options.clock ?? systemClock;
    this.sleep = options.sleep ?? systemSleep;
  }

  async ingest(
    request: IngestRequest & { targetSha?: string; forced?: boolean },
  ): Promise<IncrementalIngestResult> {
    return runWithRetry(() => this.inner.ingest(request), this.contextFromRequest(request), {
      policy: this.policy,
      clock: this.clock,
      sleep: this.sleep,
      jobs: this.jobs,
    });
  }

  async ingestFromWebhook(event: ParsedWebhook): Promise<WebhookIngestResult> {
    if (event.type !== "push" || event.deleted || event.branch === undefined) {
      return this.inner.ingestFromWebhook(event);
    }
    return runWithRetry(
      () => this.inner.ingestFromWebhook(event),
      {
        installationId: event.installationId,
        fullName: event.fullName,
        ref: event.branch,
      },
      {
        policy: this.policy,
        clock: this.clock,
        sleep: this.sleep,
        jobs: this.jobs,
      },
    );
  }

  private contextFromRequest(request: IngestRequest): RetryContext {
    return {
      installationId: request.installationId,
      fullName: resolveFullName(request),
      ref: request.ref,
    };
  }
}
