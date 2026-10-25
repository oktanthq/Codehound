import { describe, expect, it } from "vitest";
import { modelFrom } from "../cim/helpers.js";
import { securityContext } from "../../src/security/architecture.js";
import { isSecurityRuleName, SecurityRuleScanner } from "../../src/security/business-rules.js";

describe("security business-rule analysis", () => {
  it("flags route modules that define no security rule", () => {
    const findings = new SecurityRuleScanner().scan(
      securityContext({
        "src/routes.ts": 'app.post("/orders", (req, res) => res.send("ok"));\n',
      }),
    );
    expect(findings.some((finding) => finding.ruleId === "rule.missing-security")).toBe(true);
    expect(isSecurityRuleName("authenticateUser")).toBe(true);
    expect(isSecurityRuleName("validateAuth")).toBe(true);
    expect(isSecurityRuleName("greet")).toBe(false);
  });

  it("flags endpoints not governed by an existing security rule", async () => {
    const { query, run } = await modelFrom([
      {
        path: "src/auth.ts",
        content: "export function validateAuth(token: string) { return token.length > 8; }\n",
      },
      {
        path: "src/orders.ts",
        content: 'import express from "express";\nconst app = express();\napp.post("/orders", (req, res) => res.send("ok"));\n',
      },
    ]);
    const findings = new SecurityRuleScanner().scan(
      securityContext(
        {
          "src/auth.ts": "export function validateAuth(token: string) { return token.length > 8; }\n",
          "src/orders.ts":
            'import express from "express";\nconst app = express();\napp.post("/orders", (req, res) => res.send("ok"));\n',
        },
        { query, analysis: run },
      ),
    );
    expect(findings.some((finding) => finding.ruleId === "rule.ungoverned-endpoint")).toBe(true);
    expect(
      findings.some(
        (finding) => finding.ruleId === "rule.ungoverned-endpoint" && finding.path === "src/auth.ts",
      ),
    ).toBe(false);
  });
});
