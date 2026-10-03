import { createHmac, timingSafeEqual } from "node:crypto";
import { GitHubAppError } from "./errors.js";
import type { BranchTracker, RecordedPush, TrackedCommit } from "./tracking.js";
import { ZERO_SHA } from "./tracking.js";

export type WebhookHeaders = Record<string, string | undefined>;

export type DeliveryStore = {
  seen: (deliveryId: string) => Promise<boolean>;
  mark: (deliveryId: string) => Promise<void>;
};

export class InMemoryDeliveryStore implements DeliveryStore {
  private readonly ids = new Set<string>();

  async seen(deliveryId: string): Promise<boolean> {
    return this.ids.has(deliveryId);
  }

  async mark(deliveryId: string): Promise<void> {
    this.ids.add(deliveryId);
  }
}

export type ParsedPing = {
  type: "ping";
  deliveryId: string;
  zen: string | undefined;
};

export type ParsedPush = {
  type: "push";
  deliveryId: string;
  installationId: number;
  fullName: string;
  ref: string;
  branch: string | undefined;
  before: string;
  after: string;
  created: boolean;
  deleted: boolean;
  forced: boolean;
  compareUrl: string | undefined;
  cloneUrl: string | undefined;
  defaultBranch: string | undefined;
  commits: TrackedCommit[];
};

export type ParsedCreate = {
  type: "create";
  deliveryId: string;
  installationId: number;
  fullName: string;
  ref: string;
  refType: string;
};

export type ParsedDelete = {
  type: "delete";
  deliveryId: string;
  installationId: number;
  fullName: string;
  ref: string;
  refType: string;
};

export type ParsedInstallation = {
  type: "installation";
  deliveryId: string;
  installationId: number;
  action: string;
};

export type ParsedInstallationRepositories = {
  type: "installation_repositories";
  deliveryId: string;
  installationId: number;
  action: string;
  added: string[];
  removed: string[];
};

export type ParsedIgnored = {
  type: "ignored";
  deliveryId: string;
  event: string;
};

export type ParsedDuplicate = {
  type: "duplicate";
  deliveryId: string;
  event: string;
};

export type ParsedWebhook =
  | ParsedPing
  | ParsedPush
  | ParsedCreate
  | ParsedDelete
  | ParsedInstallation
  | ParsedInstallationRepositories
  | ParsedIgnored
  | ParsedDuplicate;

type GitHubPushCommit = {
  id?: string;
  message?: string;
  timestamp?: string;
  url?: string;
  author?: { name?: string; email?: string };
};

function header(headers: WebhookHeaders, name: string): string | undefined {
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target) {
      return value;
    }
  }
  return undefined;
}

export function verifyGitHubSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string,
): boolean {
  const digest = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const expected = `sha256=${digest}`;
  const left = Buffer.from(expected);
  const right = Buffer.from(signatureHeader);
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

export function signGitHubPayload(rawBody: string, secret: string): string {
  const digest = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  return `sha256=${digest}`;
}

function requireInstallationId(payload: Record<string, unknown>): number {
  const installation = payload.installation;
  if (typeof installation === "object" && installation !== null && "id" in installation) {
    const id = (installation as { id: unknown }).id;
    if (typeof id === "number" && Number.isInteger(id) && id > 0) {
      return id;
    }
  }
  throw new GitHubAppError("Webhook payload is missing installation.id", "INVALID_WEBHOOK_PAYLOAD");
}

function requireRepoFullName(payload: Record<string, unknown>): string {
  const repository = payload.repository;
  if (typeof repository === "object" && repository !== null && "full_name" in repository) {
    const fullName = (repository as { full_name: unknown }).full_name;
    if (typeof fullName === "string" && fullName.includes("/")) {
      return fullName;
    }
  }
  throw new GitHubAppError(
    "Webhook payload is missing repository.full_name",
    "INVALID_WEBHOOK_PAYLOAD",
  );
}

function readString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function branchFromRef(ref: string): string | undefined {
  const prefix = "refs/heads/";
  if (ref.startsWith(prefix)) {
    const name = ref.slice(prefix.length);
    return name.length > 0 ? name : undefined;
  }
  return undefined;
}

function mapPushCommits(value: unknown): TrackedCommit[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const commits: TrackedCommit[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) {
      continue;
    }
    const commit = item as GitHubPushCommit;
    const sha = readString(commit.id);
    if (sha.length === 0) {
      continue;
    }
    commits.push({
      sha,
      message: readString(commit.message),
      authorName: readString(commit.author?.name),
      authorEmail: readString(commit.author?.email),
      committedAt: readString(commit.timestamp),
      parents: [],
      htmlUrl: readString(commit.url),
    });
  }
  return commits;
}

function asRecord(payload: unknown): Record<string, unknown> {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new GitHubAppError("Webhook payload must be a JSON object", "INVALID_WEBHOOK_PAYLOAD");
  }
  return payload as Record<string, unknown>;
}

export function parseWebhookEvent(
  event: string,
  deliveryId: string,
  payload: unknown,
): Exclude<ParsedWebhook, ParsedDuplicate> {
  if (event === "ping") {
    const record = asRecord(payload);
    const zen = typeof record.zen === "string" ? record.zen : undefined;
    const parsed: ParsedPing = { type: "ping", deliveryId, zen };
    return parsed;
  }

  const record = asRecord(payload);

  if (event === "push") {
    const ref = readString(record.ref);
    const repository = asRecord(record.repository ?? {});
    const parsed: ParsedPush = {
      type: "push",
      deliveryId,
      installationId: requireInstallationId(record),
      fullName: requireRepoFullName(record),
      ref,
      branch: branchFromRef(ref),
      before: readString(record.before, ZERO_SHA),
      after: readString(record.after, ZERO_SHA),
      created: record.created === true,
      deleted: record.deleted === true,
      forced: record.forced === true,
      compareUrl: typeof record.compare === "string" ? record.compare : undefined,
      cloneUrl: typeof repository.clone_url === "string" ? repository.clone_url : undefined,
      defaultBranch:
        typeof repository.default_branch === "string" ? repository.default_branch : undefined,
      commits: mapPushCommits(record.commits),
    };
    return parsed;
  }

  if (event === "create") {
    return {
      type: "create",
      deliveryId,
      installationId: requireInstallationId(record),
      fullName: requireRepoFullName(record),
      ref: readString(record.ref),
      refType: readString(record.ref_type),
    };
  }

  if (event === "delete") {
    return {
      type: "delete",
      deliveryId,
      installationId: requireInstallationId(record),
      fullName: requireRepoFullName(record),
      ref: readString(record.ref),
      refType: readString(record.ref_type),
    };
  }

  if (event === "installation") {
    return {
      type: "installation",
      deliveryId,
      installationId: requireInstallationId(record),
      action: readString(record.action),
    };
  }

  if (event === "installation_repositories") {
    const addedRaw = Array.isArray(record.repositories_added) ? record.repositories_added : [];
    const removedRaw = Array.isArray(record.repositories_removed)
      ? record.repositories_removed
      : [];
    const names = (items: unknown[]): string[] =>
      items.flatMap((item) => {
        if (typeof item === "object" && item !== null && "full_name" in item) {
          const fullName = (item as { full_name: unknown }).full_name;
          return typeof fullName === "string" ? [fullName] : [];
        }
        return [];
      });
    return {
      type: "installation_repositories",
      deliveryId,
      installationId: requireInstallationId(record),
      action: readString(record.action),
      added: names(addedRaw),
      removed: names(removedRaw),
    };
  }

  return { type: "ignored", deliveryId, event };
}

function recordedPushFromEvent(event: ParsedPush): RecordedPush | undefined {
  if (event.branch === undefined) {
    return undefined;
  }
  return {
    installationId: event.installationId,
    fullName: event.fullName,
    branch: event.branch,
    before: event.before,
    after: event.after,
    created: event.created,
    deleted: event.deleted,
    forced: event.forced,
    commits: event.commits,
  };
}

export class WebhookHandler {
  private readonly deliveries: DeliveryStore;

  constructor(
    private readonly secret: string,
    options: { deliveries?: DeliveryStore } = {},
  ) {
    if (this.secret.trim().length === 0) {
      throw new GitHubAppError(
        "GITHUB_APP_WEBHOOK_SECRET is required to handle GitHub webhooks",
        "WEBHOOK_SECRET_MISSING",
      );
    }
    this.deliveries = options.deliveries ?? new InMemoryDeliveryStore();
  }

  parse(rawBody: string, headers: WebhookHeaders): ParsedWebhook {
    const signature = header(headers, "x-hub-signature-256");
    if (signature === undefined || !verifyGitHubSignature(rawBody, signature, this.secret)) {
      throw new GitHubAppError(
        "GitHub webhook signature is invalid",
        "INVALID_WEBHOOK_SIGNATURE",
        401,
      );
    }
    const event = header(headers, "x-github-event");
    const deliveryId = header(headers, "x-github-delivery");
    if (
      event === undefined ||
      event.length === 0 ||
      deliveryId === undefined ||
      deliveryId.length === 0
    ) {
      throw new GitHubAppError(
        "GitHub webhook is missing X-GitHub-Event or X-GitHub-Delivery",
        "INVALID_WEBHOOK_PAYLOAD",
        400,
      );
    }
    let payload: unknown;
    try {
      payload = JSON.parse(rawBody) as unknown;
    } catch {
      throw new GitHubAppError(
        "GitHub webhook body is not valid JSON",
        "INVALID_WEBHOOK_PAYLOAD",
        400,
      );
    }
    return parseWebhookEvent(event, deliveryId, payload);
  }

  async handle(rawBody: string, headers: WebhookHeaders): Promise<ParsedWebhook> {
    const parsed = this.parse(rawBody, headers);
    if (await this.deliveries.seen(parsed.deliveryId)) {
      return { type: "duplicate", deliveryId: parsed.deliveryId, event: parsed.type };
    }
    await this.deliveries.mark(parsed.deliveryId);
    return parsed;
  }
}

export async function applyWebhookToTracker(
  tracker: BranchTracker,
  event: ParsedWebhook,
): Promise<void> {
  if (event.type === "push") {
    const recorded = recordedPushFromEvent(event);
    if (recorded !== undefined) {
      await tracker.applyPush(recorded);
    }
    return;
  }
  if (event.type === "delete" && event.refType === "branch") {
    await tracker.applyPush({
      installationId: event.installationId,
      fullName: event.fullName,
      branch: event.ref,
      before: ZERO_SHA,
      after: ZERO_SHA,
      created: false,
      deleted: true,
      forced: false,
      commits: [],
    });
  }
}
