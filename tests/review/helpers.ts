import { analyzePullDiff } from "../../src/review/diff.js";
import type { ReviewContext } from "../../src/review/findings.js";
import type { AnalyzedFileDiff, PullFile } from "../../src/review/types.js";

export function addedFile(path: string, lines: string[], startLine = 1): PullFile {
  const body = lines.map((line) => `+${line}`).join("\n");
  return {
    path,
    status: "added",
    previousPath: undefined,
    additions: lines.length,
    deletions: 0,
    patch: `@@ -0,0 +${startLine},${lines.length} @@\n${body}`,
  };
}

export function changedFile(
  path: string,
  removed: string[],
  added: string[],
  startLine = 1,
): PullFile {
  const oldCount = Math.max(removed.length, 1);
  const newCount = Math.max(added.length, 1);
  const body = [...removed.map((line) => `-${line}`), ...added.map((line) => `+${line}`)].join(
    "\n",
  );
  return {
    path,
    status: "modified",
    previousPath: undefined,
    additions: added.length,
    deletions: removed.length,
    patch: `@@ -${startLine},${oldCount} +${startLine},${newCount} @@\n${body}`,
  };
}

export function diffsOf(...files: PullFile[]): AnalyzedFileDiff[] {
  return analyzePullDiff(files);
}

export function contextOf(files: PullFile[], extras: Partial<ReviewContext> = {}): ReviewContext {
  return {
    diffs: diffsOf(...files),
    impact: extras.impact ?? [],
    query: extras.query,
    files: extras.files ?? new Map(),
    pull: extras.pull,
  };
}
