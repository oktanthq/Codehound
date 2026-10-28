import { describe, expect, it } from "vitest";
import { remediateFinding, suggestRemediations } from "../../src/security/remediate.js";
import { makeVulnerability } from "../../src/security/types.js";

describe("vulnerability remediation suggestions", () => {
  it("rewrites eval, innerHTML, weak hashes, and hardcoded secrets", () => {
    const files = new Map([
      [
        "src/bad.ts",
        [
          "export function run(x: string) {",
          "  eval(x);",
          "  node.innerHTML = x;",
          '  createHash("md5").update(password);',
          '  const password = "hunter2secret";',
          '  fetch("http://example.com");',
          "}",
        ].join("\n"),
      ],
    ]);
    const suggestions = suggestRemediations(
      [
        makeVulnerability({
          category: "sast",
          ruleId: "sast.eval",
          severity: "critical",
          title: "eval",
          message: "eval",
          path: "src/bad.ts",
        }),
        makeVulnerability({
          category: "insecure-api",
          ruleId: "api.weak-hash",
          severity: "high",
          title: "hash",
          message: "hash",
          path: "src/bad.ts",
        }),
        makeVulnerability({
          category: "secret",
          ruleId: "secret.hardcoded",
          severity: "critical",
          title: "secret",
          message: "secret",
          path: "src/bad.ts",
        }),
        makeVulnerability({
          category: "insecure-api",
          ruleId: "api.cleartext-http",
          severity: "medium",
          title: "http",
          message: "http",
          path: "src/bad.ts",
        }),
      ],
      files,
    );
    const combined = suggestions.map((suggestion) => suggestion.patch).join("\n");
    expect(combined).toContain("-  eval(x);");
    expect(combined).toContain("+  JSON.parse(x);");
    expect(combined).toContain('createHash("sha256")');
    expect(combined).toContain("process.env.SECRET");
    expect(combined).toContain("https://example.com");
  });

  it("annotates a vulnerable package.json dependency", () => {
    const files = new Map([
      ["package.json", JSON.stringify({ dependencies: { lodash: "4.17.20" } }, null, 2) + "\n"],
    ]);
    const change = remediateFinding(
      makeVulnerability({
        category: "dependency",
        ruleId: "dependency.advisory",
        severity: "high",
        title: "lodash",
        message: "lodash",
        path: "package.json",
        cve: "CVE-2021-23337",
        packageName: "lodash",
        packageVersion: "4.17.20",
      }),
      files,
    );
    expect(change?.newText).toContain("upgrade past CVE-2021-23337");
  });
});
