import { spawn } from "node:child_process";
import { GitHubAppError, redactSecrets, type GitHubErrorCode } from "./errors.js";

export type GitCloneRequest = {
  url: string;
  destination: string;
  ref?: string;
  depth?: number;
  secrets?: string[];
};

export type GitFetchRequest = {
  repoPath: string;
  remote?: string;
  ref?: string;
  depth?: number;
  secrets?: string[];
};

export type GitCli = {
  clone: (request: GitCloneRequest) => Promise<void>;
  revParse: (repoPath: string, rev?: string) => Promise<string>;
  currentBranch: (repoPath: string) => Promise<string>;
};

export type FetchingGitCli = GitCli & {
  fetch: (request: GitFetchRequest) => Promise<void>;
  resetHard: (repoPath: string, ref: string) => Promise<void>;
  setRemoteUrl: (repoPath: string, url: string, remote?: string) => Promise<void>;
  diffNames: (repoPath: string, fromSha: string, toSha: string) => Promise<string[]>;
  mergeBase: (repoPath: string, a: string, b: string) => Promise<string | undefined>;
};

export function isFetchingGitCli(git: GitCli): git is FetchingGitCli {
  return "fetch" in git && typeof (git as FetchingGitCli).fetch === "function";
}

function runGit(
  args: string[],
  options: { cwd?: string; secrets?: string[]; errorCode?: GitHubErrorCode } = {},
): Promise<string> {
  const errorCode = options.errorCode ?? "GIT_FAILED";
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      cwd: options.cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: "0",
        GIT_ASKPASS: "echo",
        GIT_CONFIG_NOSYSTEM: "1",
      },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      reject(new GitHubAppError(redactSecrets(error.message, options.secrets ?? []), errorCode));
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }
      const detail = stderr.trim() || stdout.trim() || `git exited ${code ?? "unknown"}`;
      reject(new GitHubAppError(redactSecrets(detail, options.secrets ?? []), errorCode));
    });
  });
}

async function runGitWithSecrets(
  args: string[],
  options: { cwd?: string; secrets?: string[]; errorCode?: GitHubErrorCode } = {},
): Promise<string> {
  const runOptions: { cwd?: string; secrets?: string[]; errorCode?: GitHubErrorCode } = {};
  if (options.cwd !== undefined) {
    runOptions.cwd = options.cwd;
  }
  if (options.secrets !== undefined) {
    runOptions.secrets = options.secrets;
  }
  if (options.errorCode !== undefined) {
    runOptions.errorCode = options.errorCode;
  }
  return runGit(args, runOptions);
}

export class ProcessGitCli implements FetchingGitCli {
  async clone(request: GitCloneRequest): Promise<void> {
    const args = ["clone"];
    const depth = request.depth ?? 1;
    if (depth > 0) {
      args.push("--depth", String(depth));
    }
    if (request.ref !== undefined && request.ref.length > 0) {
      args.push("--branch", request.ref, "--single-branch");
    }
    args.push("--", request.url, request.destination);
    await runGitWithSecrets(args, {
      errorCode: "CLONE_FAILED",
      ...(request.secrets !== undefined ? { secrets: request.secrets } : {}),
    });
  }

  async revParse(repoPath: string, rev = "HEAD"): Promise<string> {
    return runGit(["rev-parse", rev], { cwd: repoPath });
  }

  async currentBranch(repoPath: string): Promise<string> {
    return runGit(["rev-parse", "--abbrev-ref", "HEAD"], { cwd: repoPath });
  }

  async fetch(request: GitFetchRequest): Promise<void> {
    const remote = request.remote ?? "origin";
    const args = ["fetch"];
    if (request.depth !== undefined && request.depth > 0) {
      args.push("--depth", String(request.depth));
    }
    args.push(remote);
    if (request.ref !== undefined && request.ref.length > 0) {
      args.push(request.ref);
    }
    await runGitWithSecrets(args, {
      cwd: request.repoPath,
      ...(request.secrets !== undefined ? { secrets: request.secrets } : {}),
    });
  }

  async resetHard(repoPath: string, ref: string): Promise<void> {
    await runGit(["reset", "--hard", ref], { cwd: repoPath });
  }

  async setRemoteUrl(repoPath: string, url: string, remote = "origin"): Promise<void> {
    try {
      await runGit(["remote", "set-url", remote, url], { cwd: repoPath, secrets: [url] });
    } catch {
      await runGit(["remote", "add", remote, url], { cwd: repoPath, secrets: [url] });
    }
  }

  async diffNames(repoPath: string, fromSha: string, toSha: string): Promise<string[]> {
    const output = await runGit(["diff", "--name-only", fromSha, toSha], { cwd: repoPath });
    if (output.length === 0) {
      return [];
    }
    return output
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }

  async mergeBase(repoPath: string, a: string, b: string): Promise<string | undefined> {
    try {
      const sha = await runGit(["merge-base", a, b], { cwd: repoPath });
      return sha.length > 0 ? sha : undefined;
    } catch {
      return undefined;
    }
  }
}

export function authenticatedCloneUrl(cloneUrl: string, token: string): string {
  if (!cloneUrl.startsWith("http://") && !cloneUrl.startsWith("https://")) {
    return cloneUrl;
  }
  const url = new URL(cloneUrl);
  url.username = "x-access-token";
  url.password = token;
  return url.toString();
}
