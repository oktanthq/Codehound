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

  await exec("git", ["init", "-b", "main"], { cwd: path });
  await exec("git", ["config", "user.name", "codehound"], { cwd: path });
  await exec("git", ["config", "user.email", "codehound@example.com"], { cwd: path });
  await exec("git", ["add", "."], { cwd: path });
  await exec("git", ["commit", "-m", "init"], { cwd: path });
  const { stdout } = await exec("git", ["rev-parse", "HEAD"], { cwd: path });
  return { path, sha: stdout.trim(), branch: "main" };
}
