import { describe, expect, it } from "vitest";
import { AdapterRegistry } from "../../src/analysis/adapter.js";
import { analysisFilesFromIngest } from "../../src/analysis/from-ingest.js";
import { AnalysisPipeline } from "../../src/analysis/pipeline.js";
import type { AnalysisFile, LanguageAdapter } from "../../src/analysis/index.js";

const context = {
  repositoryFullName: "oktant/demo",
  commitSha: "abc",
  ref: "main",
};

function typescriptAdapter(): LanguageAdapter {
  return {
    id: "typescript",
    languages: ["TypeScript"],
    async analyze(file) {
      return {
        path: file.path,
        language: "TypeScript",
        adapterId: "typescript",
        symbols: [{ name: "placeholder", kind: "file", startLine: 1, endLine: 1 }],
        imports: [],
        calls: [],
        relations: [],
        endpoints: [],
        dataFlows: [],
      };
    },
  };
}

describe("AnalysisPipeline", () => {
  it("dispatches files to the adapter for their language", async () => {
    const pipeline = new AnalysisPipeline().register(typescriptAdapter());
    const files: AnalysisFile[] = [
      { path: "src/index.ts", language: "TypeScript", kind: "source", content: "export {};\n" },
      { path: "README.md", language: "Markdown", kind: "docs", content: "# demo\n" },
      { path: "bin/run", language: undefined, kind: "other", content: "echo\n" },
    ];

    const run = await pipeline.analyze(context, files);

    expect(run.documents).toEqual([
      {
        path: "src/index.ts",
        language: "TypeScript",
        adapterId: "typescript",
        symbols: [{ name: "placeholder", kind: "file", startLine: 1, endLine: 1 }],
        imports: [],
        calls: [],
        relations: [],
        endpoints: [],
        dataFlows: [],
      },
    ]);
    expect(run.skipped).toEqual([
      {
        path: "README.md",
        language: "Markdown",
        reason: "unsupported-language",
        message: "no adapter registered for Markdown",
      },
      {
        path: "bin/run",
        language: undefined,
        reason: "undetected-language",
        message: undefined,
      },
    ]);
  });

  it("isolates adapter failures so other files still analyze", async () => {
    const failing: LanguageAdapter = {
      id: "python",
      languages: ["Python"],
      async analyze() {
        throw new Error("parse failed");
      },
    };
    const pipeline = new AnalysisPipeline({
      registry: new AdapterRegistry().register(failing).register(typescriptAdapter()),
    });
    const run = await pipeline.analyze(context, [
      { path: "app.py", language: "Python", kind: "source", content: "pass\n" },
      { path: "src/index.ts", language: "TypeScript", kind: "source", content: "export {};\n" },
    ]);

    expect(run.documents.map((document) => document.path)).toEqual(["src/index.ts"]);
    expect(run.skipped).toEqual([
      {
        path: "app.py",
        language: "Python",
        reason: "adapter-failed",
        message: "parse failed",
      },
    ]);
  });
});

describe("analysisFilesFromIngest", () => {
  it("copies language detection onto analysis files", () => {
    const files = analysisFilesFromIngest(
      [{ path: "src/index.ts", size: 12, language: "TypeScript", kind: "source" }],
      new Map([["src/index.ts", "export {};\n"]]),
    );
    expect(files).toEqual([
      {
        path: "src/index.ts",
        language: "TypeScript",
        kind: "source",
        content: "export {};\n",
      },
    ]);
  });
});
