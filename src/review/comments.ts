import type { ReviewFinding } from "./findings.js";

export type ReviewComment = {
  path: string;
  line: number | undefined;
  body: string;
  findingIds: string[];
};

function commentLine(findings: readonly ReviewFinding[]): number | undefined {
  return findings.find((finding) => finding.startLine !== undefined)?.startLine;
}

export function formatFindingComment(finding: ReviewFinding): string {
  const location =
    finding.startLine === undefined ? finding.path : `${finding.path}:${finding.startLine}`;
  const lines = [
    `**[${finding.severity}] ${finding.title}** (\`${finding.ruleId}\`)`,
    "",
    finding.message,
    "",
    `_Location: ${location}_`,
  ];
  if (finding.evidence !== undefined && finding.evidence.length > 0) {
    lines.push("", "```", finding.evidence, "```");
  }
  return lines.join("\n");
}

export function commentsFromFindings(findings: readonly ReviewFinding[]): ReviewComment[] {
  const grouped = new Map<string, ReviewFinding[]>();
  for (const finding of findings) {
    const key = `${finding.path}:${finding.startLine ?? 0}`;
    const current = grouped.get(key) ?? [];
    current.push(finding);
    grouped.set(key, current);
  }
  return [...grouped.values()].map((group) => {
    const first = group[0];
    return {
      path: first?.path ?? "",
      line: commentLine(group),
      body: group.map((finding) => formatFindingComment(finding)).join("\n\n---\n\n"),
      findingIds: group.map((finding) => finding.id),
    };
  });
}
