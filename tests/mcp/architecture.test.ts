import { describe, expect, it } from "vitest";
import { DEMO_REPO, callTool, createDemoServer } from "./harness.js";

describe("MCP component and architecture queries", () => {
  it("lists components, layers, and layer dependencies", async () => {
    const { server } = await createDemoServer();
    const components = await callTool(server, "codehound_list_components", {
      repository: DEMO_REPO,
    });
    const listed = components.data as {
      components: { name: string; attributes?: { componentKind?: string } }[];
    };
    expect(
      listed.components.some(
        (component) =>
          component.name === "UsersController" &&
          component.attributes?.componentKind === "controller",
      ),
    ).toBe(true);

    const layers = await callTool(server, "codehound_list_layers", { repository: DEMO_REPO });
    const layerData = layers.data as { layers: { name: string; files: string[] }[] };
    expect(
      layerData.layers.some(
        (layer) => layer.name === "application" && layer.files.includes("src/greet.ts"),
      ),
    ).toBe(true);

    const architecture = await callTool(server, "codehound_get_architecture", {
      repository: DEMO_REPO,
    });
    const graph = architecture.data as {
      layers: string[];
      layerDependencies: { from: string; to: string }[];
    };
    expect(graph.layers).toEqual(expect.arrayContaining(["application", "test"]));
    expect(graph.layerDependencies).toContainEqual(
      expect.objectContaining({ from: "test", to: "application" }),
    );
  });
});
