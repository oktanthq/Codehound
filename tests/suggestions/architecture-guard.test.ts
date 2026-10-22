import { describe, expect, it } from "vitest";
import { architectureGuard } from "../../src/suggestions/guards.js";

describe("architecture-aware modifications", () => {
  it("blocks application imports of tests", () => {
    expect(
      architectureGuard({
        path: "src/app.ts",
        oldText: "export const n = 1;\n",
        newText: 'import { x } from "../tests/x.test.js";\nexport const n = 1;\n',
        description: "bad import",
      }),
    ).toMatch(/test/);
  });
});
