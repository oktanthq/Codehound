import { describe, expect, it } from "vitest";
import { createDefaultAnalysisPipeline } from "../../src/analysis/defaults.js";
import { ingestAnalysisRun } from "../../src/cim/from-analysis.js";
import { CodeIntelligenceModel } from "../../src/cim/model.js";
import { CimQueryLayer } from "../../src/cim/query.js";

async function modelFrom(files: { path: string; content: string }[]) {
  const run = await createDefaultAnalysisPipeline().analyze(
    { repositoryFullName: "oktant/demo", commitSha: "abc", ref: "main" },
    files.map((file) => ({
      path: file.path,
      language: "TypeScript",
      kind: "source" as const,
      content: file.content,
    })),
  );
  const model = new CodeIntelligenceModel();
  ingestAnalysisRun(model, run);
  return { model, query: new CimQueryLayer(model), run };
}

describe("ingestAnalysisRun", () => {
  it("creates repository, file, and symbol entities", async () => {
    const { query } = await modelFrom([
      {
        path: "src/greet.ts",
        content: "export function greet(name: string) { return name; }\n",
      },
    ]);
    expect(query.byKind("repository")).toHaveLength(1);
    expect(query.byKind("file")[0]?.path).toBe("src/greet.ts");
    expect(query.entities({ kind: "symbol", name: "greet" })).toHaveLength(1);
  });

  it("records import and dependency edges", async () => {
    const { query } = await modelFrom([
      {
        path: "src/index.ts",
        content: 'import { greet } from "./greet.js";\nexport const n = greet("x");\n',
      },
      {
        path: "src/greet.ts",
        content: "export function greet(name: string) { return name; }\n",
      },
    ]);
    expect(query.graph("depends-on").edges.length).toBeGreaterThan(0);
    expect(query.graph("imports").edges[0]?.kind).toBe("imports");
  });

  it("records call, component, endpoint, layer, and data-flow facts", async () => {
    const { query } = await modelFrom([
      {
        path: "src/users.controller.ts",
        content: `@Controller("users")
export class UsersController {
  @Get()
  list() {
    const copy = name;
    return copy;
  }
}
export function validateUser(name: string) {
  return helper(name);
}
function helper(name: string) { return name; }
`,
      },
    ]);
    expect(query.graph("calls").edges.length).toBeGreaterThan(0);
    expect(
      query.byKind("component").some((entity) => entity.attributes.componentKind === "controller"),
    ).toBe(true);
    expect(query.byKind("endpoint").length).toBeGreaterThan(0);
    expect(query.byKind("layer").some((entity) => entity.name === "application")).toBe(true);
    expect(query.graph("flows-to").edges.length).toBeGreaterThan(0);
    expect(query.byKind("rule").some((entity) => entity.name === "validateUser")).toBe(true);
    expect(query.graph("governs").edges.length).toBeGreaterThan(0);
  });
});
