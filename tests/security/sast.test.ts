import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { securityContext } from "../../src/security/architecture.js";
import { BUILTIN_SAST_RULES, SastRulesEngine, sastScanner } from "../../src/security/sast.js";

function commandExecIds(engine: SastRulesEngine, files: Record<string, string>): string[] {
  return engine
    .scan(securityContext(files))
    .filter((finding) => finding.ruleId === "sast.command-exec")
    .map((finding) => finding.evidence ?? finding.path);
}

function walkSourceFiles(root: string): Record<string, string> {
  const files: Record<string, string> = {};
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(full);
        continue;
      }
      if (!/\.(ts|tsx|js|jsx|mts|cts)$/.test(entry.name)) {
        continue;
      }
      files[relative(process.cwd(), full).replace(/\\/g, "/")] = readFileSync(full, "utf8");
    }
  };
  visit(root);
  return files;
}

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

  it("does not flag RegExp or other method exec calls as command execution", () => {
    const engine = new SastRulesEngine();
    const findings = commandExecIds(engine, {
      "src/regex.ts": [
        "const PATTERN = /foo/;",
        "const fromLiteral = /a/.exec(s);",
        "const fromIdent = PATTERN.exec(line);",
        "const fromCtor = new RegExp(x).exec(y);",
      ].join("\n"),
    });
    expect(findings).toEqual([]);
  });

  it("flags child_process exec, spawn, and execSync usages", () => {
    const engine = new SastRulesEngine();
    const findings = engine.scan(
      securityContext({
        "src/imported-exec.ts": 'import { exec } from "node:child_process";\nexec(cmd);\n',
        "src/renamed-exec.ts": 'import { exec as run } from "node:child_process";\nrun(cmd);\n',
        "src/required-spawn.ts": 'require("child_process").spawn("ls", []);\n',
        "src/alias-execsync.ts": "cp.execSync(cmd);\n",
      }),
    );
    const command = findings.filter((finding) => finding.ruleId === "sast.command-exec");
    expect(command.map((finding) => finding.path).sort()).toEqual([
      "src/alias-execsync.ts",
      "src/imported-exec.ts",
      "src/renamed-exec.ts",
      "src/required-spawn.ts",
    ]);
  });

  it("reports no command-exec findings across Codehound src", () => {
    const engine = new SastRulesEngine();
    const findings = engine
      .scan(securityContext(walkSourceFiles(join(process.cwd(), "src"))))
      .filter((finding) => finding.ruleId === "sast.command-exec");
    expect(findings).toEqual([]);
  });
});
