import { describe, expect, it } from "vitest";
import { createDefaultAnalysisPipeline } from "../../src/analysis/defaults.js";
import {
  detectFrameworks,
  isTargetLanguage,
  TARGET_LANGUAGES,
} from "../../src/analysis/targets.js";

describe("target languages", () => {
  it("names typescript and javascript as the initial targets", () => {
    expect([...TARGET_LANGUAGES]).toEqual(["TypeScript", "JavaScript"]);
    expect(isTargetLanguage("TypeScript")).toBe(true);
    expect(isTargetLanguage("Python")).toBe(false);
  });
});

describe("detectFrameworks", () => {
  it("detects react, nest, and express from analysis documents", async () => {
    const pipeline = createDefaultAnalysisPipeline();
    const react = await pipeline.analyze(
      { repositoryFullName: "oktant/demo", commitSha: "a", ref: "main" },
      [
        {
          path: "src/Button.tsx",
          language: "TypeScript",
          kind: "source",
          content: "export function Button() { return <button/>; }\n",
        },
      ],
    );
    const nest = await pipeline.analyze(
      { repositoryFullName: "oktant/demo", commitSha: "b", ref: "main" },
      [
        {
          path: "src/users.controller.ts",
          language: "TypeScript",
          kind: "source",
          content:
            '@Controller("users")\nexport class UsersController {\n  @Get()\n  list() {}\n}\n',
        },
      ],
    );
    const express = await pipeline.analyze(
      { repositoryFullName: "oktant/demo", commitSha: "c", ref: "main" },
      [
        {
          path: "src/http.ts",
          language: "TypeScript",
          kind: "source",
          content: 'app.get("/users", listUsers);\n',
        },
      ],
    );
    expect(detectFrameworks(react.documents).map((item) => item.name)).toEqual(["React"]);
    expect(detectFrameworks(nest.documents).map((item) => item.name)).toEqual(["Nest"]);
    expect(detectFrameworks(express.documents).map((item) => item.name)).toEqual(["Express"]);
  });
});
