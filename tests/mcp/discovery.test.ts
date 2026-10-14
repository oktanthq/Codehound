import { describe, expect, it } from "vitest";
import { DEMO_REPO, callTool, createDemoServer } from "./harness.js";

describe("MCP project discovery tools", () => {
  it("lists and describes indexed projects and files", async () => {
    const { server } = await createDemoServer();
    const listed = await callTool(server, "codehound_list_projects", {});
    const projects = listed.data as { projects: { fullName: string; fileCount: number }[] };
    expect(projects.projects[0]?.fullName).toBe(DEMO_REPO);
    expect(projects.projects[0]?.fileCount).toBeGreaterThan(0);

    const project = await callTool(server, "codehound_get_project", { repository: DEMO_REPO });
    const summary = project.data as { layers: string[]; symbolCount: number };
    expect(summary.layers).toEqual(expect.arrayContaining(["application", "test"]));
    expect(summary.symbolCount).toBeGreaterThan(0);

    const files = await callTool(server, "codehound_list_files", {
      repository: DEMO_REPO,
      pathPrefix: "src/",
    });
    const fileList = files.data as { files: { path: string }[] };
    expect(fileList.files.some((file) => file.path === "src/greet.ts")).toBe(true);
    expect(fileList.files.some((file) => file.path.startsWith("tests/"))).toBe(false);
  });
});
