import { describe, expect, it } from "vitest";
import { rulePreservationGuard } from "../../src/suggestions/guards.js";

describe("business-rule preservation checks", () => {
  it("blocks dropping exported validate functions", () => {
    expect(
      rulePreservationGuard({
        path: "src/users.ts",
        oldText: "export function validateUser(name: string) { return name; }\n",
        newText: "export function displayUser(name: string) { return name; }\n",
        description: "drop rule",
      }),
    ).toMatch(/validateUser/);
  });
});
