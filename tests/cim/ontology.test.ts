import { describe, expect, it } from "vitest";
import {
  ENTITY_KINDS,
  isEntityKind,
  isRelationKind,
  RELATION_KINDS,
} from "../../src/cim/ontology.js";

describe("CIM ontology", () => {
  it("names the core entity and relation kinds", () => {
    expect(ENTITY_KINDS).toContain("symbol");
    expect(ENTITY_KINDS).toContain("rule");
    expect(RELATION_KINDS).toContain("depends-on");
    expect(RELATION_KINDS).toContain("governs");
    expect(isEntityKind("file")).toBe(true);
    expect(isEntityKind("unknown")).toBe(false);
    expect(isRelationKind("calls")).toBe(true);
  });
});
