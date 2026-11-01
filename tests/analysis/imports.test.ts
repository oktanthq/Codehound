import { describe, expect, it } from "vitest";
import { extractImportBindings, extractImports } from "../../src/analysis/imports.js";
import { parseTypeScript } from "../../src/analysis/parse.js";

describe("extractImports", () => {
  it("extracts module specifiers from import, export, require, and dynamic import", () => {
    const source = `
import fs from "node:fs";
import "./side-effect";
export { join } from "node:path";
import util = require("node:util");
const ts = require("typescript");
const loaded = import("./load.js");
`;
    const parsed = parseTypeScript("src/deps.ts", source, "TypeScript");
    expect(extractImports(parsed.sourceFile)).toEqual([
      { source: "node:fs", kind: "import" },
      { source: "./side-effect", kind: "import" },
      { source: "node:path", kind: "export" },
      { source: "node:util", kind: "require" },
      { source: "typescript", kind: "require" },
      { source: "./load.js", kind: "dynamic" },
    ]);
  });

  it("extracts local bindings for named, namespace, require, and member imports", () => {
    const source = `
import { exec, spawn as run } from "node:child_process";
import cp from "child_process";
import * as proc from "child_process";
const required = require("child_process");
const { execFile } = require("child_process");
const execSync = require("child_process").execSync;
`;
    const parsed = parseTypeScript("src/bindings.ts", source, "TypeScript");
    expect(extractImportBindings(parsed.sourceFile)).toEqual([
      { source: "node:child_process", kind: "import", local: "exec", imported: "exec" },
      { source: "node:child_process", kind: "import", local: "run", imported: "spawn" },
      { source: "child_process", kind: "import", local: "cp", imported: "default" },
      { source: "child_process", kind: "import", local: "proc", imported: "*" },
      { source: "child_process", kind: "require", local: "required", imported: "*" },
      { source: "child_process", kind: "require", local: "execFile", imported: "execFile" },
      { source: "child_process", kind: "require", local: "execSync", imported: "execSync" },
    ]);
  });
});
