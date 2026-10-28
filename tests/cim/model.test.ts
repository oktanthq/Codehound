import { describe, expect, it } from "vitest";
import { CodeIntelligenceModel, entityId, relationId } from "../../src/cim/model.js";

describe("CodeIntelligenceModel", () => {
  it("stores entities, relations, and snapshots", () => {
    const model = new CodeIntelligenceModel();
    const fileId = entityId("file", "oktant/demo", "src/a.ts");
    const symbolId = entityId("symbol", "oktant/demo", "src/a.ts#greet");
    model.upsertEntity({
      id: fileId,
      kind: "file",
      name: "src/a.ts",
      path: "src/a.ts",
      repositoryFullName: "oktant/demo",
      commitSha: "abc",
      attributes: {},
    });
    model.upsertEntity({
      id: symbolId,
      kind: "symbol",
      name: "greet",
      path: "src/a.ts",
      repositoryFullName: "oktant/demo",
      commitSha: "abc",
      attributes: {},
    });
    model.upsertRelation({
      id: relationId("contains", fileId, symbolId),
      kind: "contains",
      fromId: fileId,
      toId: symbolId,
    });
    expect(model.query({ kind: "symbol", name: "greet" })).toHaveLength(1);
    expect(model.neighbors(fileId, "contains")).toHaveLength(1);
    expect(model.snapshot("oktant/demo", "abc", "2023-11-14T22:13:20.000Z").version).toBe(1);
    expect(model.bumpVersion()).toBe(2);
  });
});
