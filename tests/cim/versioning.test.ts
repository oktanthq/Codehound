import { describe, expect, it } from "vitest";
import { InMemoryCimStore } from "../../src/cim/store.js";
import { getVersion, listVersions, persistNewVersion } from "../../src/cim/versioning.js";
import { modelFrom } from "./helpers.js";

describe("CIM versioning", () => {
  it("records successive snapshots with increasing versions", async () => {
    const { model } = await modelFrom([{ path: "src/a.ts", content: "export const n = 1;\n" }], {
      commitSha: "aaa",
    });
    const store = new InMemoryCimStore();
    const v1 = await persistNewVersion(
      store,
      model,
      "oktant/demo",
      "aaa",
      "2023-11-14T22:13:20.000Z",
    );
    const v2 = await persistNewVersion(
      store,
      model,
      "oktant/demo",
      "bbb",
      "2023-11-14T22:14:20.000Z",
    );
    expect(v1.version).toBe(2);
    expect(v2.version).toBe(3);
    expect(await listVersions(store, "oktant/demo")).toEqual([3, 2]);
    expect((await getVersion(store, "oktant/demo", 2))?.commitSha).toBe("aaa");
    expect((await store.getLatest("oktant/demo"))?.commitSha).toBe("bbb");
  });
});
