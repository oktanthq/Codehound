import { GitHubAppError, redactSecrets } from "./errors.js";
import type { HttpClient, HttpRequest } from "./http.js";
import type { GitHubAppCredentials } from "./types.js";

export type GitHubRequest = {
  method: string;
  path: string;
  token: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
};

export type GitHubResponse<T> = {
  status: number;
  data: T;
  headers: Record<string, string>;
};

function buildUrl(
  apiBaseUrl: string,
  path: string,
  query: Record<string, string | number | boolean | undefined> | undefined,
): string {
  const url = new URL(path.replace(/^\//, ""), `${apiBaseUrl.replace(/\/+$/, "")}/`);
  if (query !== undefined) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) {
        continue;
      }
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function parseBody(body: string): unknown {
  if (body.trim().length === 0) {
    return undefined;
  }
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return { message: body };
  }
}

function githubMessage(data: unknown): string {
  if (typeof data === "object" && data !== null && "message" in data) {
    const message = (data as { message: unknown }).message;
    if (typeof message === "string" && message.length > 0) {
      return message;
    }
  }
  return "GitHub API request failed";
}

export class GitHubApi {
  constructor(
    private readonly credentials: Pick<GitHubAppCredentials, "apiBaseUrl">,
    private readonly http: HttpClient,
  ) {}

  async request<T>(req: GitHubRequest): Promise<GitHubResponse<T>> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${req.token}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "codehound",
    };

    const httpReq: HttpRequest = {
      method: req.method,
      url: buildUrl(this.credentials.apiBaseUrl, req.path, req.query),
      headers,
    };

    if (req.body !== undefined) {
      headers["content-type"] = "application/json";
      httpReq.body = JSON.stringify(req.body);
    }

    const res = await this.http.request(httpReq);
    const data = parseBody(res.body);
    if (res.status >= 400) {
      throw new GitHubAppError(
        redactSecrets(githubMessage(data), [req.token]),
        "GITHUB_HTTP_ERROR",
        res.status,
      );
    }

    return { status: res.status, data: data as T, headers: res.headers };
  }
}
