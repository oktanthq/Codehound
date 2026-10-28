import { describe, expect, it } from "vitest";
import { detectFile, summarizeLanguages } from "../../src/github/languages.js";

describe("detectFile", () => {
  it("maps extensions to languages", () => {
    expect(detectFile("src/index.ts", undefined)).toEqual({
      language: "TypeScript",
      kind: "source",
    });
    expect(detectFile("lib/app.py", undefined).language).toBe("Python");
    expect(detectFile("cmd/main.go", undefined).language).toBe("Go");
    expect(detectFile("src/main.rs", undefined).language).toBe("Rust");
  });

  it("maps special filenames", () => {
    expect(detectFile("Dockerfile", undefined)).toEqual({
      language: "Dockerfile",
      kind: "config",
    });
    expect(detectFile("Makefile", undefined).language).toBe("Makefile");
    expect(detectFile("go.mod", undefined).language).toBe("Go");
  });

  it("classifies tests, docs, and config", () => {
    expect(detectFile("src/index.test.ts", undefined).kind).toBe("test");
    expect(detectFile("tests/walk.ts", undefined).kind).toBe("test");
    expect(detectFile("README.md", undefined)).toEqual({
      language: "Markdown",
      kind: "docs",
    });
    expect(detectFile("package.json", undefined)).toEqual({
      language: "JSON",
      kind: "config",
    });
    expect(detectFile("data/users.csv", undefined).kind).toBe("data");
  });

  it("uses a shebang when the path has no language", () => {
    expect(detectFile("bin/run", "#!/usr/bin/env python3\nprint(1)\n")).toEqual({
      language: "Python",
      kind: "source",
    });
    expect(detectFile("scripts/boot", "#!/bin/bash\necho hi\n").language).toBe("Shell");
    expect(detectFile("bin/run", "not a shebang").language).toBeUndefined();
  });

  it("prefers the path over a shebang", () => {
    expect(detectFile("src/index.ts", "#!/usr/bin/env python3\n").language).toBe("TypeScript");
  });
});

describe("summarizeLanguages", () => {
  it("picks the primary language from source bytes", () => {
    const summary = summarizeLanguages([
      { size: 100, language: "Markdown", kind: "docs" },
      { size: 40, language: "TypeScript", kind: "source" },
      { size: 10, language: "TypeScript", kind: "test" },
      { size: 80, language: "JSON", kind: "config" },
      { size: 20, language: "Python", kind: "source" },
    ]);
    expect(summary.primaryLanguage).toBe("TypeScript");
    expect(summary.languages.map((entry) => entry.language)).toEqual([
      "Markdown",
      "JSON",
      "TypeScript",
      "Python",
    ]);
    expect(summary.languages.find((entry) => entry.language === "TypeScript")).toEqual({
      language: "TypeScript",
      fileCount: 2,
      byteSize: 50,
    });
  });

  it("falls back to any detected language when there is no source", () => {
    const summary = summarizeLanguages([{ size: 12, language: "Markdown", kind: "docs" }]);
    expect(summary.primaryLanguage).toBe("Markdown");
  });
});
