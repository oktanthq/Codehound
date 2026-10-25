import { describe, expect, it } from "vitest";
import { securityContext } from "../../src/security/architecture.js";
import { InjectionScanner } from "../../src/security/injection.js";

describe("injection-path detection", () => {
  it("detects SQL, command, path, and XSS injection shapes", () => {
    const findings = new InjectionScanner().scan(
      securityContext({
        "src/api.ts": [
          "export function handle(req: { query: { id: string }; params: { file: string }; body: { html: string } }) {",
          "  const id = req.query.id;",
          "  query(`SELECT * FROM users WHERE id = ${id}`);",
          "  exec(`rm ${req.query.id}`);",
          "  readFile(req.params.file);",
          "  element.innerHTML = req.body.html;",
          "}",
        ].join("\n"),
      }),
    );
    const ids = findings.map((finding) => finding.ruleId);
    expect(ids).toContain("injection.sql");
    expect(ids).toContain("injection.command");
    expect(ids).toContain("injection.path");
    expect(ids).toContain("injection.xss");
  });

  it("ignores parameterized queries and literal HTML", () => {
    const findings = new InjectionScanner().scan(
      securityContext({
        "src/ok.ts": [
          'query("SELECT * FROM users WHERE id = $1", [id]);',
          'element.innerHTML = "<p>ok</p>";',
        ].join("\n"),
      }),
    );
    expect(findings).toEqual([]);
  });
});
