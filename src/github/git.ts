import { spawn } from "node:child_process";
import { GitHubAppError, redactSecrets } from "./errors.js";

export type GitCloneRequest = {
  url: string;
  destination: string;
  ref?: string;
  depth?: number;
  secrets?: string[];
};

export type GitCli = {
  clone: (request: GitCloneRequest) => Promise<void>;
  revParse: (repoPath: string, rev?: string) => Promise<string>;
  currentBranch: (repoPath: string) => Promise<string>;
};

function runGit(
  args: string[],
  options: { cwd?: string; secrets?: string[] } = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      cwd: options.cwd,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: "0",
        GIT_ASKPASS: "echo",
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
      reject(
        new GitHubAppError(redactSecrets(error.message, options.secrets ?? []), "CLONE_FAILED"),
      );
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }
      const detail = stderr.trim() || stdout.trim() || `git exited ${code ?? "unknown"}`;
      reject(new GitHubAppError(redactSecrets(detail, options.secrets ?? []), "CLONE_FAILED"));
    });
  });
}

export class ProcessGitCli implements GitCli {
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
    const secrets = request.secrets;
    if (secrets !== undefined) {
      await runGit(args, { secrets });
    } else {
      await runGit(args);
    }
  }

  async revParse(repoPath: string, rev = "HEAD"): Promise<string> {
    return runGit(["rev-parse", rev], { cwd: repoPath });
  }

  async currentBranch(repoPath: string): Promise<string> {
    return runGit(["rev-parse", "--abbrev-ref", "HEAD"], { cwd: repoPath });
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
