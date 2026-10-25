import { describe, expect, it } from "vitest";
import { createDefaultAnalysisPipeline } from "../../src/analysis/defaults.js";
import { securityContext } from "../../src/security/architecture.js";
import { TracingScanner } from "../../src/security/tracing.js";

describe("cross-component vulnerability tracing", () => {
  it("follows an import from a request handler into a query sink", async () => {
    const handler = [
      'import { runQuery } from "./db.js";',
      "export function handle(req: { query: { q: string } }) {",
      "  const q = req.query.q;",
      "  return runQuery(q);",
      "}",
    ].join("\n");
    const db = [
      "export function runQuery(q: string) {",
      "  return query(q);",
      "}",
    ].join("\n");
    const run = await createDefaultAnalysisPipeline().analyze(
      { repositoryFullName: "oktant/demo", commitSha: "abc", ref: "main" },
      [
        { path: "src/handler.ts", language: "TypeScript", kind: "source", content: handler },
        { path: "src/db.ts", language: "TypeScript", kind: "source", content: db },
      ],
    );
    const findings = new TracingScanner().scan(
      securityContext(
        { "src/handler.ts": handler, "src/db.ts": db },
        { analysis: run },
      ),
    );
    expect(findings.some((finding) => finding.ruleId === "tracing.cross-component")).toBe(true);
    expect(findings[0]?.path).toBe("src/db.ts");
    expect(findings[0]?.trace?.some((step) => step.includes("src/handler.ts"))).toBe(true);
    expect(findings[0]?.trace?.some((step) => step.includes("src/db.ts"))).toBe(true);
  });

  it("does not trace when the imported module has no sink", async () => {
    const handler = 'import { add } from "./math.js";\nexport function handle(req: { query: { n: string } }) { return add(1, 2); }\n';
    const math = "export function add(a: number, b: number) { return a + b; }\n";
    const run = await createDefaultAnalysisPipeline().analyze(
      { repositoryFullName: "oktant/demo", commitSha: "abc", ref: "main" },
      [
        { path: "src/handler.ts", language: "TypeScript", kind: "source", content: handler },
        { path: "src/math.ts", language: "TypeScript", kind: "source", content: math },
      ],
    );
    const findings = new TracingScanner().scan(
      securityContext(
        { "src/handler.ts": handler, "src/math.ts": math },
        { analysis: run },
      ),
    );
    expect(findings).toEqual([]);
  });
});
