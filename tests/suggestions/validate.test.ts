import { describe, expect, it } from "vitest";
import { validateChange } from "../../src/suggestions/validate.js";

describe("generated-change validation", () => {
  it("accepts parseable TypeScript and rejects syntax errors", () => {
    expect(
      validateChange(
        {
          path: "src/ok.ts",
          oldText: "export const n = 1;\n",
          newText: "export const n = 2;\n",
          description: "ok",
        },
        undefined,
      ).ok,
    ).toBe(true);
    expect(
      validateChange(
        {
          path: "src/bad.ts",
          oldText: "export const n = 1;\n",
          newText: "function (\n",
          description: "bad",
        },
        undefined,
      ).ok,
    ).toBe(false);
  });
});
