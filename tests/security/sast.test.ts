import { describe, expect, it } from "vitest";
import { securityContext } from "../../src/security/architecture.js";
import { BUILTIN_SAST_RULES, SastRulesEngine, sastScanner } from "../../src/security/sast.js";

describe("SAST rules engine", () => {
  it("flags eval, HTML sinks, and command execution", () => {
    const engine = new SastRulesEngine();
    const findings = engine.scan(
      securityContext({
        "src/render.ts": [
          "export function run(input: string) {",
          "  eval(input);",
          "  element.innerHTML = input;",
          "  exec('ls ' + input);",
          "}",
        ].join("\n"),
      }),
    );
    const ids = findings.map((finding) => finding.ruleId);
    expect(ids).toContain("sast.eval");
    expect(ids).toContain("sast.xss-html");
    expect(ids).toContain("sast.command-exec");
    expect(findings.find((finding) => finding.ruleId === "sast.eval")?.cwe).toBe("CWE-95");
    expect(findings.find((finding) => finding.ruleId === "sast.eval")?.startLine).toBe(2);
  });

  it("skips comments, accepts custom rules, and ignores lockfiles", () => {
    const engine = new SastRulesEngine();
    engine.register({
      id: "sast.custom-todo",
      title: "Custom",
      message: "custom",
      severity: "low",
      cwe: undefined,
      languages: undefined,
      match: (line) => line.includes("CUSTOM_SINK"),
    });
    const findings = engine.scan(
      securityContext({
        "src/ok.ts": "// eval(user)\nexport const n = 1;\nCUSTOM_SINK();\n",
        "package.json": `{ "name": "demo" }`,
      }),
    );
    expect(findings.some((finding) => finding.ruleId === "sast.eval")).toBe(false);
    expect(findings.some((finding) => finding.ruleId === "sast.custom-todo")).toBe(true);
    expect(BUILTIN_SAST_RULES.length).toBeGreaterThan(3);
    expect(sastScanner().id).toBe("sast");
  });
});
