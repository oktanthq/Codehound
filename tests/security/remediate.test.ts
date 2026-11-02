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

  it("bumps a direct dependency to the patched version as valid JSON", () => {
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
        patchedVersion: "4.17.21",
      }),
      files,
    );
    expect(change).toBeDefined();
    const parsed = JSON.parse(change?.newText ?? "") as {
      dependencies: { lodash: string };
    };
    expect(parsed.dependencies.lodash).toBe("4.17.21");
    expect(change?.newText).not.toContain("/*");
    expect(change?.description).toContain("4.17.21");
    expect(change?.description).toContain("CVE-2021-23337");
  });

  it("bumps a devDependency and keeps caret and tilde range prefixes", () => {
    const files = new Map([
      [
        "package.json",
        JSON.stringify(
          {
            dependencies: { lodash: "^4.17.20" },
            devDependencies: { minimist: "~1.2.5" },
          },
          null,
          2,
        ) + "\n",
      ],
    ]);
    const lodash = remediateFinding(
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
        patchedVersion: "4.17.21",
      }),
      files,
    );
    const minimist = remediateFinding(
      makeVulnerability({
        category: "dependency",
        ruleId: "dependency.advisory",
        severity: "critical",
        title: "minimist",
        message: "minimist",
        path: "package.json",
        cve: "CVE-2021-44906",
        packageName: "minimist",
        packageVersion: "1.2.5",
        patchedVersion: "1.2.6",
      }),
      files,
    );
    const lodashParsed = JSON.parse(lodash?.newText ?? "") as {
      dependencies: { lodash: string };
    };
    const minimistParsed = JSON.parse(minimist?.newText ?? "") as {
      devDependencies: { minimist: string };
    };
    expect(lodashParsed.dependencies.lodash).toBe("^4.17.21");
    expect(minimistParsed.devDependencies.minimist).toBe("~1.2.6");
    expect(lodash?.newText.endsWith("\n")).toBe(true);
    expect(lodash?.newText).toMatch(/^\{/);
  });

  it("preserves indentation, key order, and trailing newline", () => {
    const original = [
      "{",
      '\t"name": "demo",',
      '\t"dependencies": {',
      '\t\t"lodash": "^4.17.20"',
      "\t}",
      "}",
      "",
    ].join("\n");
    const change = remediateFinding(
      makeVulnerability({
        category: "dependency",
        ruleId: "dependency.advisory",
        severity: "high",
        title: "lodash",
        message: "lodash",
        path: "package.json",
        packageName: "lodash",
        packageVersion: "4.17.20",
        patchedVersion: "4.17.21",
      }),
      new Map([["package.json", original]]),
    );
    expect(change?.newText).toBe(
      [
        "{",
        '\t"name": "demo",',
        '\t"dependencies": {',
        '\t\t"lodash": "^4.17.21"',
        "\t}",
        "}",
        "",
      ].join("\n"),
    );
    expect(() => JSON.parse(change?.newText ?? "")).not.toThrow();
  });

  it("does not emit a file change when no fixed version is known", () => {
    const files = new Map([
      ["package.json", JSON.stringify({ dependencies: { lodash: "^4.17.20" } }, null, 2) + "\n"],
    ]);
    const finding = makeVulnerability({
      category: "dependency",
      ruleId: "dependency.advisory",
      severity: "high",
      title: "lodash",
      message: "lodash",
      path: "package.json",
      cve: "CVE-2021-23337",
      packageName: "lodash",
      packageVersion: "4.17.20",
    });
    expect(remediateFinding(finding, files)).toBeUndefined();
    const [suggestion] = suggestRemediations([finding], files);
    expect(suggestion?.changes).toEqual([]);
    expect(suggestion?.patch).toBe("");
    expect(suggestion?.title).toMatch(/no fixed version is known/i);
    expect(suggestion?.title).toContain("lodash@4.17.20");
  });

  it("does not rewrite lockfiles for transitive-only packages", () => {
    const lockfile = JSON.stringify(
      {
        packages: {
          "": { dependencies: { express: "4.19.2" } },
          "node_modules/express": { version: "4.19.2" },
          "node_modules/minimist": { version: "1.2.5" },
        },
      },
      null,
      2,
    );
    const files = new Map([
      ["package.json", JSON.stringify({ dependencies: { express: "4.19.2" } }, null, 2) + "\n"],
      ["package-lock.json", `${lockfile}\n`],
    ]);
    const finding = makeVulnerability({
      category: "dependency",
      ruleId: "dependency.advisory",
      severity: "critical",
      title: "minimist",
      message: "minimist",
      path: "package-lock.json",
      cve: "CVE-2021-44906",
      packageName: "minimist",
      packageVersion: "1.2.5",
      patchedVersion: "1.2.6",
    });
    expect(remediateFinding(finding, files)).toBeUndefined();
    const [suggestion] = suggestRemediations([finding], files);
    expect(suggestion?.changes).toEqual([]);
    expect(suggestion?.title).toMatch(/lockfile-only|transitive/i);
    expect(suggestion?.title).toContain("1.2.6");
  });

  it("updates package.json when a lockfile finding is a direct dependency", () => {
    const files = new Map([
      ["package.json", JSON.stringify({ dependencies: { lodash: "^4.17.20" } }, null, 2) + "\n"],
      [
        "package-lock.json",
        JSON.stringify({ packages: { "node_modules/lodash": { version: "4.17.20" } } }, null, 2),
      ],
    ]);
    const change = remediateFinding(
      makeVulnerability({
        category: "dependency",
        ruleId: "dependency.advisory",
        severity: "high",
        title: "lodash",
        message: "lodash",
        path: "package-lock.json",
        cve: "CVE-2021-23337",
        packageName: "lodash",
        packageVersion: "4.17.20",
        patchedVersion: "4.17.21",
      }),
      files,
    );
    expect(change?.path).toBe("package.json");
    const parsed = JSON.parse(change?.newText ?? "") as {
      dependencies: { lodash: string };
    };
    expect(parsed.dependencies.lodash).toBe("^4.17.21");
  });
});
