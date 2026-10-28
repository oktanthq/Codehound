import { describe, expect, it } from "vitest";
import { extractImports } from "../../src/analysis/imports.js";
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
});
