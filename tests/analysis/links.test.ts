import { describe, expect, it } from "vitest";
import { createDefaultAnalysisPipeline } from "../../src/analysis/defaults.js";
import { linkDocuments } from "../../src/analysis/links.js";
import type { AnalysisDocument } from "../../src/analysis/types.js";

function document(path: string, specifiers: string[]): AnalysisDocument {
  return {
    path,
    language: "TypeScript",
    adapterId: "typescript",
    symbols: [],
    imports: specifiers.map((source) => ({ source, kind: "import" })),
    calls: [],
    relations: [],
    endpoints: [],
    dataFlows: [],
    components: [],
  };
}

describe("linkDocuments", () => {
  it("resolves relative imports onto analyzed files", () => {
    const links = linkDocuments([
      document("src/index.ts", ["./util", "./missing", "typescript"]),
      document("src/util.ts", []),
    ]);
    expect(links).toEqual([
      { fromPath: "src/index.ts", toPath: "src/util.ts", kind: "import", specifier: "./util" },
    ]);
  });
});

describe("AnalysisPipeline cross-file links", () => {
  it("attaches import links after analyzing a set of files", async () => {
    const run = await createDefaultAnalysisPipeline().analyze(
      { repositoryFullName: "oktant/demo", commitSha: "abc", ref: "main" },
      [
        {
          path: "src/index.ts",
          language: "TypeScript",
          kind: "source",
          content: 'import { helper } from "./helper.js";\nexport const n = helper();\n',
        },
        {
          path: "src/helper.ts",
          language: "TypeScript",
          kind: "source",
          content: "export function helper(): number { return 1; }\n",
        },
      ],
    );
    expect(run.links).toEqual([
      {
        fromPath: "src/index.ts",
        toPath: "src/helper.ts",
        kind: "import",
        specifier: "./helper.js",
      },
    ]);
  });
});
