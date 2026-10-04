import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GitHubApp } from "../../src/github/app.js";
import { RepositoryAuthorizer } from "../../src/github/authz.js";
import { ProcessGitCli } from "../../src/github/git.js";
import { RepositoryIngestor } from "../../src/github/ingest.js";
import { InMemoryMetadataStore } from "../../src/github/metadata.js";
import { InMemorySelectionStore } from "../../src/github/selection.js";
import { createOriginRepository } from "../helpers/git-origin.js";
import { MockHttp } from "../helpers/http.js";
import { generateTestAppKeys } from "../helpers/keys.js";

const NOW = 1_700_000_000;

function isoFromNow(offsetSeconds: number): string {
  return new Date((NOW + offsetSeconds) * 1000).toISOString();
}

function mockGithub(cloneUrl: string): MockHttp {
  return new MockHttp()
    .on({
      method: "GET",
      urlIncludes: "/app/installations/9",
      body: {
        id: 9,
        account: { id: 1, login: "oktant", type: "Organization" },
        app_id: 4242,
        target_type: "Organization",
        repository_selection: "selected",
        permissions: { contents: "read", metadata: "read" },
        suspended_at: null,
      },
    })
    .on({
      method: "POST",
      urlIncludes: "/app/installations/9/access_tokens",
      body: {
        token: "ghs_ingest_token",
        expires_at: isoFromNow(3600),
        permissions: { contents: "read", metadata: "read" },
        repository_selection: "selected",
      },
    })
    .on({
      method: "GET",
      urlIncludes: "/repos/oktant/demo",
      body: {
        id: 55,
        name: "demo",
        full_name: "oktant/demo",
        owner: { login: "oktant" },
        private: true,
        fork: false,
        archived: false,
        disabled: false,
        default_branch: "main",
        language: "TypeScript",
        visibility: "private",
        html_url: "https://github.com/oktant/demo",
        clone_url: cloneUrl,
        size: 1,
        description: "demo",
      },
    });
}

describe("InMemoryMetadataStore", () => {
  it("stores repository and version records from an ingest snapshot", async () => {
    const origin = await createOriginRepository();
    const metadata = new InMemoryMetadataStore();
    const app = GitHubApp.fromEnv(
      {
        GITHUB_APP_ID: "4242",
        GITHUB_APP_PRIVATE_KEY: generateTestAppKeys().privateKeyPkcs8,
      },
      {
        http: mockGithub(origin.path),
        clock: { nowSeconds: () => NOW, now: () => new Date(NOW * 1000) },
      },
    );
    const selections = new InMemorySelectionStore();
    await selections.add({
      installationId: 9,
      fullName: "oktant/demo",
      owner: "oktant",
      name: "demo",
      selectedAt: isoFromNow(0),
    });
    const ingestor = new RepositoryIngestor(app, new RepositoryAuthorizer(app, selections), {
      rootDir: await mkdtemp(join(tmpdir(), "codehound-meta-")),
      git: new ProcessGitCli(),
      clock: { nowSeconds: () => NOW, now: () => new Date(NOW * 1000) },
      metadata,
    });

    const snapshot = await ingestor.ingest({ installationId: 9, fullName: "oktant/demo" });
    const repository = await metadata.getRepository(9, "oktant/demo");
    const version = await metadata.getVersion(9, "oktant/demo", snapshot.commitSha);
    const latest = await metadata.getLatestVersion(9, "OKTANT/demo");

    expect(repository?.lastIngestedSha).toBe(origin.sha);
    expect(repository?.primaryLanguage).toBe("TypeScript");
    expect(repository?.lastRef).toBe("main");
    expect(repository?.fileCount).toBe(2);
    expect(version?.commitSha).toBe(origin.sha);
    expect(version?.files.map((file) => file.path)).toEqual(["README.md", "src/index.ts"]);
    expect(latest?.commitSha).toBe(origin.sha);
    expect((await metadata.listRepositories(9)).map((item) => item.repository.fullName)).toEqual([
      "oktant/demo",
    ]);
  });

  it("keeps version history newest first", async () => {
    const store = new InMemoryMetadataStore();
    const repository = {
      id: 1,
      name: "demo",
      fullName: "oktant/demo",
      owner: "oktant",
      private: true,
      fork: false,
      archived: false,
      disabled: false,
      defaultBranch: "main",
      language: "TypeScript" as string | undefined,
      visibility: "private" as const,
      htmlUrl: "https://github.com/oktant/demo",
      cloneUrl: "https://github.com/oktant/demo.git",
      size: 1,
    };
    await store.saveIngest({
      installationId: 9,
      repository,
      ref: "main",
      commitSha: "aaa",
      ingestedAt: isoFromNow(0),
      worktreePath: "/tmp/a",
      fileCount: 1,
      byteSize: 10,
      languages: [{ language: "TypeScript", fileCount: 1, byteSize: 10 }],
      primaryLanguage: "TypeScript",
      files: [{ path: "a.ts", size: 10, language: "TypeScript", kind: "source" }],
    });
    await store.saveIngest({
      installationId: 9,
      repository,
      ref: "main",
      commitSha: "bbb",
      ingestedAt: isoFromNow(10),
      worktreePath: "/tmp/b",
      fileCount: 2,
      byteSize: 20,
      languages: [{ language: "TypeScript", fileCount: 2, byteSize: 20 }],
      primaryLanguage: "TypeScript",
      files: [
        { path: "a.ts", size: 10, language: "TypeScript", kind: "source" },
        { path: "b.ts", size: 10, language: "TypeScript", kind: "source" },
      ],
    });

    const versions = await store.listVersions(9, "oktant/demo");
    expect(versions.map((item) => item.commitSha)).toEqual(["bbb", "aaa"]);
    expect((await store.getLatestVersion(9, "oktant/demo"))?.fileCount).toBe(2);
    expect((await store.getRepository(9, "oktant/demo"))?.lastIngestedSha).toBe("bbb");
  });
});
