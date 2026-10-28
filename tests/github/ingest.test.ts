import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GitHubApp } from "../../src/github/app.js";
import { RepositoryAuthorizer } from "../../src/github/authz.js";
import { GitHubAppError } from "../../src/github/errors.js";
import { ProcessGitCli, type GitCli } from "../../src/github/git.js";
import { RepositoryIngestor } from "../../src/github/ingest.js";
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

async function createIngestor(cloneUrl: string, git?: GitCli) {
  const app = GitHubApp.fromEnv(
    {
      GITHUB_APP_ID: "4242",
      GITHUB_APP_PRIVATE_KEY: generateTestAppKeys().privateKeyPkcs8,
    },
    {
      http: mockGithub(cloneUrl),
      clock: { nowSeconds: () => NOW, now: () => new Date(NOW * 1000) },
    },
  );
  const selections = new InMemorySelectionStore();
  const authorizer = new RepositoryAuthorizer(app, selections);
  const rootDir = await mkdtemp(join(tmpdir(), "codehound-ingest-"));
  const ingestor = new RepositoryIngestor(app, authorizer, {
    rootDir,
    git: git ?? new ProcessGitCli(),
    clock: { nowSeconds: () => NOW, now: () => new Date(NOW * 1000) },
  });
  return { ingestor, selections, rootDir };
}

describe("RepositoryIngestor", () => {
  it("clones a selected repository and records a snapshot", async () => {
    const origin = await createOriginRepository();
    const { ingestor, selections, rootDir } = await createIngestor(origin.path);
    await selections.add({
      installationId: 9,
      fullName: "oktant/demo",
      owner: "oktant",
      name: "demo",
      selectedAt: isoFromNow(0),
    });

    const snapshot = await ingestor.ingest({ installationId: 9, fullName: "oktant/demo" });

    expect(snapshot.commitSha).toBe(origin.sha);
    expect(snapshot.ref).toBe("main");
    expect(snapshot.worktreePath).toBe(join(rootDir, "9", "oktant", "demo"));
    expect(snapshot.files.map((file) => file.path)).toEqual(["README.md", "src/index.ts"]);
    expect(snapshot.fileCount).toBe(2);
    expect(snapshot.byteSize).toBeGreaterThan(0);
    expect(snapshot.primaryLanguage).toBe("TypeScript");
    expect(snapshot.files[1]).toMatchObject({ language: "TypeScript", kind: "source" });
    expect(snapshot.repository.fullName).toBe("oktant/demo");
  });

  it("refuses to ingest a repository that is not selected", async () => {
    const origin = await createOriginRepository();
    const { ingestor } = await createIngestor(origin.path);
    await expect(
      ingestor.ingest({ installationId: 9, fullName: "oktant/demo" }),
    ).rejects.toMatchObject({
      code: "REPOSITORY_NOT_SELECTED",
    });
  });

  it("redacts installation tokens when clone fails", async () => {
    const git: GitCli = {
      clone: async () => {
        throw new Error(
          "fatal: could not read https://x-access-token:ghs_ingest_token@github.com/oktant/demo.git",
        );
      },
      revParse: async () => "unused",
      currentBranch: async () => "main",
    };
    const { ingestor, selections } = await createIngestor(
      "https://github.com/oktant/demo.git",
      git,
    );
    await selections.add({
      installationId: 9,
      fullName: "oktant/demo",
      owner: "oktant",
      name: "demo",
      selectedAt: isoFromNow(0),
    });

    await expect(ingestor.ingest({ installationId: 9, fullName: "oktant/demo" })).rejects.toSatisfy(
      (error: unknown) => {
        expect(error).toBeInstanceOf(GitHubAppError);
        const failed = error as GitHubAppError;
        expect(failed.code).toBe("CLONE_FAILED");
        expect(failed.message).not.toContain("ghs_ingest_token");
        expect(failed.message).toContain("[redacted]");
        return true;
      },
    );
  });
});
