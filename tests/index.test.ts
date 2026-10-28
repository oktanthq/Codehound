import { describe, expect, it } from "vitest";
import { name, version } from "../src/index.js";

describe("codehound package", () => {
  it("exposes package identity", () => {
    expect(name).toBe("codehound");
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
