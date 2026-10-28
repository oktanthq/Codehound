export function splitLines(text: string): string[] {
  if (text.length === 0) {
    return [];
  }
  return text.split("\n");
}

export function unifiedDiff(path: string, oldText: string, newText: string): string {
  if (oldText === newText) {
    return "";
  }
  const oldLines = splitLines(oldText);
  const newLines = splitLines(newText);
  let prefix = 0;
  while (
    prefix < oldLines.length &&
    prefix < newLines.length &&
    oldLines[prefix] === newLines[prefix]
  ) {
    prefix += 1;
  }
  let oldEnd = oldLines.length - 1;
  let newEnd = newLines.length - 1;
  while (oldEnd >= prefix && newEnd >= prefix && oldLines[oldEnd] === newLines[newEnd]) {
    oldEnd -= 1;
    newEnd -= 1;
  }
  const oldCount = Math.max(0, oldEnd - prefix + 1);
  const newCount = Math.max(0, newEnd - prefix + 1);
  const oldStart = oldLines.length === 0 ? 0 : prefix + 1;
  const newStart = newLines.length === 0 ? 0 : prefix + 1;
  const lines = [
    `--- a/${path}`,
    `+++ b/${path}`,
    `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`,
  ];
  for (let index = prefix; index <= oldEnd; index += 1) {
    lines.push(`-${oldLines[index] ?? ""}`);
  }
  for (let index = prefix; index <= newEnd; index += 1) {
    lines.push(`+${newLines[index] ?? ""}`);
  }
  return `${lines.join("\n")}\n`;
}

export function combinePatches(patches: readonly string[]): string {
  return patches.filter((patch) => patch.length > 0).join("\n");
}
