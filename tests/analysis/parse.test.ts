import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createDefaultAnalysisPipeline } from "../../src/analysis/defaults.js";
import { loadAnalysisContents } from "../../src/analysis/load.js";
import { parseTypeScript } from "../../src/analysis/parse.js";
import { TypeScriptLanguageAdapter } from "../../src/analysis/typescript-adapter.js";

const context = {
  repositoryFullName: "oktant/demo",
  commitSha: "abc",
  ref: "main",
};

describe("parseTypeScript", () => {
  it("parses a source file into an AST", () => {
    const parsed = parseTypeScript(
      "src/index.ts",
      "export function hello(name: string): string {\n  return name;\n}\n",
      "TypeScript",
    );
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.sourceFile.statements).toHaveLength(1);
    expect(parsed.language).toBe("TypeScript");
  });

  it("reports syntactic diagnostics", () => {
    const parsed = parseTypeScript("src/bad.ts", "function (\n", "TypeScript");
    expect(parsed.diagnostics.length).toBeGreaterThan(0);
  });
});

describe("TypeScriptLanguageAdapter", () => {
  it("emits a document for valid typescript and javascript", async () => {
    const adapter = new TypeScriptLanguageAdapter();
    const tsDoc = await adapter.analyze(
      {
        path: "src/index.ts",
        language: "TypeScript",
        kind: "source",
        content: "export const n = 1;\n",
      },
      context,
    );
    const jsDoc = await adapter.analyze(
      {
        path: "src/index.js",
        language: "JavaScript",
        kind: "source",
        content: "module.exports = 1;\n",
      },
      context,
    );
    expect(tsDoc.adapterId).toBe("typescript");
    expect(tsDoc.symbols).toEqual([{ name: "n", kind: "variable", startLine: 1, endLine: 1 }]);
    expect(jsDoc.language).toBe("JavaScript");
  });

  it("fails when content is missing or the file is not parseable", async () => {
    const adapter = new TypeScriptLanguageAdapter();
    await expect(
      adapter.analyze(
        { path: "src/index.ts", language: "TypeScript", kind: "source", content: undefined },
        context,
      ),
    ).rejects.toThrow(/missing source content/);
    await expect(
      adapter.analyze(
        { path: "src/bad.ts", language: "TypeScript", kind: "source", content: "function (\n" },
        context,
      ),
    ).rejects.toThrow();
  });
});

describe("createDefaultAnalysisPipeline", () => {
  it("loads worktree contents and parses typescript files", async () => {
    const root = await mkdtemp(join(tmpdir(), "codehound-parse-"));
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src", "index.ts"), "export function run(): void {}\n");
    await writeFile(join(root, "README.md"), "# demo\n");
    const files = await loadAnalysisContents(root, [
      { path: "src/index.ts", language: "TypeScript", kind: "source", content: undefined },
      { path: "README.md", language: "Markdown", kind: "docs", content: undefined },
    ]);
    const run = await createDefaultAnalysisPipeline().analyze(context, files);
    expect(run.documents).toEqual([
      {
        path: "src/index.ts",
        language: "TypeScript",
        adapterId: "typescript",
        symbols: [{ name: "run", kind: "function", startLine: 1, endLine: 1 }],
        imports: [],
        calls: [],
        relations: [],
        endpoints: [],
      },
    ]);
    expect(run.skipped.map((item) => item.path)).toEqual(["README.md"]);
  });
});
