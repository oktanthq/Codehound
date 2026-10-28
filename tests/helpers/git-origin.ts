import { execFile } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

export type OriginRepository = {
  path: string;
  sha: string;
  branch: string;
};

export async function createOriginRepository(): Promise<OriginRepository> {
  const path = await mkdtemp(join(tmpdir(), "codehound-origin-"));
  await mkdir(join(path, "src"), { recursive: true });
  await mkdir(join(path, "node_modules", "pkg"), { recursive: true });
  await writeFile(join(path, "README.md"), "# demo\n");
  await writeFile(join(path, "src", "index.ts"), "export const n = 1;\n");
  await writeFile(join(path, "node_modules", "pkg", "index.js"), "module.exports = 1;\n");
  await writeFile(join(path, "logo.png"), Buffer.from([137, 80, 78, 71]));

  const gitEnv = {
    ...process.env,
    GIT_TERMINAL_PROMPT: "0",
    GIT_AUTHOR_NAME: "codehound",
    GIT_AUTHOR_EMAIL: "codehound@example.com",
    GIT_COMMITTER_NAME: "codehound",
    GIT_COMMITTER_EMAIL: "codehound@example.com",
  };
  await exec("git", ["init", "-b", "main"], { cwd: path, env: gitEnv });
  await exec("git", ["config", "user.name", "codehound"], { cwd: path, env: gitEnv });
  await exec("git", ["config", "user.email", "codehound@example.com"], { cwd: path, env: gitEnv });
  await exec("git", ["config", "commit.gpgsign", "false"], { cwd: path, env: gitEnv });
  await exec("git", ["add", "."], { cwd: path, env: gitEnv });
  await exec("git", ["-c", "commit.gpgsign=false", "commit", "-m", "init"], {
    cwd: path,
    env: gitEnv,
  });
  const { stdout } = await exec("git", ["rev-parse", "HEAD"], { cwd: path });
  return { path, sha: stdout.trim(), branch: "main" };
}

export async function commitOriginFile(
  repoPath: string,
  relativePath: string,
  contents: string,
  message: string,
): Promise<string> {
  const filePath = join(repoPath, relativePath);
  await mkdir(join(filePath, ".."), { recursive: true });
  await writeFile(filePath, contents);
  const gitEnv = {
    ...process.env,
    GIT_TERMINAL_PROMPT: "0",
    GIT_AUTHOR_NAME: "codehound",
    GIT_AUTHOR_EMAIL: "codehound@example.com",
    GIT_COMMITTER_NAME: "codehound",
    GIT_COMMITTER_EMAIL: "codehound@example.com",
  };
  await exec("git", ["add", relativePath], { cwd: repoPath, env: gitEnv });
  await exec("git", ["-c", "commit.gpgsign=false", "commit", "-m", message], {
    cwd: repoPath,
    env: gitEnv,
  });
  const { stdout } = await exec("git", ["rev-parse", "HEAD"], { cwd: repoPath });
  return stdout.trim();
}
