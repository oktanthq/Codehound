import { describe, expect, it } from "vitest";
import { makeFinding } from "../../src/review/findings.js";
import { reviewEventFor, summarizeReview } from "../../src/review/summary.js";

describe("PR summary generation", () => {
  it("approves clean reviews and requests changes for high severity", () => {
    expect(reviewEventFor([])).toBe("APPROVE");
    const high = makeFinding({
      category: "security",
      ruleId: "security.eval",
      severity: "critical",
      title: "Dynamic evaluation",
      message: "eval",
      path: "src/a.ts",
      startLine: 1,
    });
    expect(reviewEventFor([high])).toBe("REQUEST_CHANGES");
    const summary = summarizeReview([high]);
    expect(summary.body).toContain("Codehound review");
    expect(summary.body).toContain("Dynamic evaluation");
    expect(summary.counts.critical).toBe(1);
    expect(summary.event).toBe("REQUEST_CHANGES");
  });
});
