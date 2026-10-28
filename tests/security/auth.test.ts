import { describe, expect, it } from "vitest";
import { securityContext } from "../../src/security/architecture.js";
import { AuthScanner } from "../../src/security/auth.js";

describe("authentication and authorization analysis", () => {
  it("flags unprotected admin routes, jwt.decode, and identity bypass", () => {
    const findings = new AuthScanner().scan(
      securityContext({
        "src/routes.ts": [
          'import jwt from "jsonwebtoken";',
          'app.get("/health", (req, res) => res.send("ok"));',
          'app.post("/admin/users", (req, res) => res.send("ok"));',
          "req.user = req.query.user;",
          "const payload = jwt.decode(token);",
        ].join("\n"),
      }),
    );
    const ids = findings.map((finding) => finding.ruleId);
    expect(ids).toContain("auth.unprotected-endpoint");
    expect(ids).toContain("auth.jwt-decode");
    expect(ids).toContain("auth.identity-bypass");
    expect(
      findings.some(
        (finding) =>
          finding.ruleId === "auth.unprotected-endpoint" && finding.evidence?.includes("/health"),
      ),
    ).toBe(false);
  });

  it("accepts routes that pass requireAuth", () => {
    const findings = new AuthScanner().scan(
      securityContext({
        "src/routes.ts": [
          "export function requireAuth() { return true; }",
          'app.post("/admin/users", requireAuth, handler);',
        ].join("\n"),
      }),
    );
    expect(findings.some((finding) => finding.ruleId === "auth.unprotected-endpoint")).toBe(false);
  });
});
