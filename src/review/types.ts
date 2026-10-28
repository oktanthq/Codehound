export type PullRef = {
  number: number;
  title: string;
  body: string;
  state: string;
  draft: boolean;
  htmlUrl: string;
  fullName: string;
  baseRef: string;
  baseSha: string;
  headRef: string;
  headSha: string;
  author: string;
  updatedAt: string;
};

export type PullFile = {
  path: string;
  status: string;
  previousPath: string | undefined;
  additions: number;
  deletions: number;
  patch: string | undefined;
};

export type PullCommit = {
  sha: string;
  message: string;
  authorName: string;
};

export type IngestedPull = {
  installationId: number;
  pull: PullRef;
  files: PullFile[];
  commits: PullCommit[];
  ingestedAt: string;
};

export type DiffLineKind = "context" | "add" | "del";

export type DiffLine = {
  kind: DiffLineKind;
  oldLine: number | undefined;
  newLine: number | undefined;
  text: string;
};

export type DiffHunk = {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  header: string;
  lines: DiffLine[];
};

export type AnalyzedFileDiff = {
  path: string;
  status: string;
  hunks: DiffHunk[];
  addedLines: number[];
  deletedLines: number[];
};
