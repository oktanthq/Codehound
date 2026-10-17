import type { AnalyzedFileDiff, DiffHunk, DiffLine, PullFile } from "./types.js";

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;

export function parsePatch(patch: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  let current: DiffHunk | undefined;
  let oldLine = 0;
  let newLine = 0;

  for (const raw of patch.split(/\r?\n/)) {
    const header = HUNK_HEADER.exec(raw);
    if (header !== null) {
      current = {
        oldStart: Number.parseInt(header[1] ?? "0", 10),
        oldCount: Number.parseInt(header[2] ?? "1", 10),
        newStart: Number.parseInt(header[3] ?? "0", 10),
        newCount: Number.parseInt(header[4] ?? "1", 10),
        header: (header[5] ?? "").trim(),
        lines: [],
      };
      oldLine = current.oldStart;
      newLine = current.newStart;
      hunks.push(current);
      continue;
    }
    if (current === undefined) {
      continue;
    }
    if (raw.startsWith("+")) {
      const line: DiffLine = {
        kind: "add",
        oldLine: undefined,
        newLine,
        text: raw.slice(1),
      };
      current.lines.push(line);
      newLine += 1;
      continue;
    }
    if (raw.startsWith("-")) {
      const line: DiffLine = {
        kind: "del",
        oldLine,
        newLine: undefined,
        text: raw.slice(1),
      };
      current.lines.push(line);
      oldLine += 1;
      continue;
    }
    if (raw.startsWith("\\")) {
      continue;
    }
    const text = raw.startsWith(" ") ? raw.slice(1) : raw;
    current.lines.push({
      kind: "context",
      oldLine,
      newLine,
      text,
    });
    oldLine += 1;
    newLine += 1;
  }
  return hunks;
}

export function lineNumbers(hunks: readonly DiffHunk[], kind: "add" | "del"): number[] {
  const values: number[] = [];
  for (const hunk of hunks) {
    for (const line of hunk.lines) {
      if (line.kind !== kind) {
        continue;
      }
      const number = kind === "add" ? line.newLine : line.oldLine;
      if (number !== undefined) {
        values.push(number);
      }
    }
  }
  return values;
}

export function analyzePullDiff(files: readonly PullFile[]): AnalyzedFileDiff[] {
  return files.map((file) => {
    const hunks = file.patch === undefined ? [] : parsePatch(file.patch);
    return {
      path: file.path,
      status: file.status,
      hunks,
      addedLines: lineNumbers(hunks, "add"),
      deletedLines: lineNumbers(hunks, "del"),
    };
  });
}
