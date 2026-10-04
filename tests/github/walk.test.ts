import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { listIngestedFiles } from "../../src/github/walk.js";

describe("listIngestedFiles", () => {
  it("skips ignored directories and binary files", async () => {
    const root = await mkdtemp(join(tmpdir(), "codehound-walk-"));
    await mkdir(join(root, "src"), { recursive: true });
    await mkdir(join(root, "node_modules", "pkg"), { recursive: true });
    await mkdir(join(root, ".git"), { recursive: true });
    await writeFile(join(root, "README.md"), "hello\n");
    await writeFile(join(root, "src", "index.ts"), "export {};\n");
    await writeFile(join(root, "node_modules", "pkg", "index.js"), "ignored\n");
    await writeFile(join(root, ".git", "HEAD"), "ref: refs/heads/main\n");
    await writeFile(join(root, "logo.png"), Buffer.from([1, 2, 3]));

    const files = await listIngestedFiles(root);
    expect(files.map((file) => file.path)).toEqual(["README.md", "src/index.ts"]);
    expect(files[0]?.size).toBeGreaterThan(0);
    expect(files[0]).toMatchObject({ language: "Markdown", kind: "docs" });
    expect(files[1]).toMatchObject({ language: "TypeScript", kind: "source" });
  });

  it("detects language from a shebang when the file has no extension", async () => {
    const root = await mkdtemp(join(tmpdir(), "codehound-walk-"));
    await mkdir(join(root, "bin"), { recursive: true });
    await writeFile(join(root, "bin", "run"), "#!/usr/bin/env python3\nprint(1)\n");

    const files = await listIngestedFiles(root);
    expect(files).toEqual([
      expect.objectContaining({
        path: "bin/run",
        language: "Python",
        kind: "source",
      }),
    ]);
  });
});
