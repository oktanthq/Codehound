import { describe, expect, it } from "vitest";
import { authenticatedCloneUrl } from "../../src/github/git.js";

describe("authenticatedCloneUrl", () => {
  it("injects the installation token into https clone URLs", () => {
    const url = authenticatedCloneUrl("https://github.com/oktant/codehound.git", "ghs_secret");
    expect(url).toBe("https://x-access-token:ghs_secret@github.com/oktant/codehound.git");
  });

  it("leaves local paths unchanged", () => {
    expect(authenticatedCloneUrl("/tmp/origin", "ghs_secret")).toBe("/tmp/origin");
  });
});
