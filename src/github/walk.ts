import { readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";

export type IngestedFile = {
  path: string;
  size: number;
};

const IGNORE_DIRECTORIES = new Set([
  ".git",
  ".hg",
  ".svn",
  ".idea",
  ".vscode",
  "node_modules",
  "dist",
  "build",
  "out",
  ".next",
  "coverage",
  "vendor",
  "target",
  "__pycache__",
  ".venv",
  "venv",
  ".tox",
]);

const IGNORE_FILE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".pdf",
  ".zip",
  ".gz",
  ".tgz",
  ".7z",
  ".rar",
  ".wasm",
  ".so",
  ".dylib",
  ".dll",
  ".exe",
  ".class",
  ".jar",
  ".woff",
  ".woff2",
  ".eot",
  ".ttf",
  ".otf",
  ".mp3",
  ".mp4",
  ".webm",
  ".bin",
]);

function extensionOf(name: string): string {
  const index = name.lastIndexOf(".");
  if (index <= 0) {
    return "";
  }
  return name.slice(index).toLowerCase();
}

export async function listIngestedFiles(root: string): Promise<IngestedFile[]> {
  const files: IngestedFile[] = [];

  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (IGNORE_DIRECTORIES.has(entry.name)) {
          continue;
        }
        await visit(fullPath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      if (IGNORE_FILE_EXTENSIONS.has(extensionOf(entry.name))) {
        continue;
      }
      const info = await stat(fullPath);
      files.push({
        path: relative(root, fullPath).replaceAll("\\", "/"),
        size: info.size,
      });
    }
  }

  await visit(root);
  files.sort((a, b) => a.path.localeCompare(b.path));
  return files;
}
