import type { SecurityPipeline } from "./engine.js";
import { securityContext } from "./architecture.js";
import type { VulnerabilityFinding } from "./types.js";

export type SecurityEvalFile = {
  path: string;
  content: string;
};

export type SecurityEvalCase = {
  id: string;
  files: SecurityEvalFile[];
  expectedRuleIds: string[];
};

export type SecurityEvalScores = {
  id: string;
  predicted: string[];
  expected: string[];
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  f1: number;
};

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function predictedIds(findings: readonly VulnerabilityFinding[]): string[] {
  return unique(findings.map((finding) => finding.ruleId));
}

export function scoreCase(predicted: readonly string[], expected: readonly string[]): Omit<
  SecurityEvalScores,
  "id" | "predicted" | "expected"
> {
  const predictedSet = new Set(predicted);
  const expectedSet = new Set(expected);
  let truePositives = 0;
  for (const id of expectedSet) {
    if (predictedSet.has(id)) {
      truePositives += 1;
    }
  }
  const falsePositives = [...predictedSet].filter((id) => !expectedSet.has(id)).length;
  const falseNegatives = [...expectedSet].filter((id) => !predictedSet.has(id)).length;
  const precision = predictedSet.size === 0 ? (expectedSet.size === 0 ? 1 : 0) : truePositives / predictedSet.size;
  const recall = expectedSet.size === 0 ? 1 : truePositives / expectedSet.size;
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { truePositives, falsePositives, falseNegatives, precision, recall, f1 };
}

export async function evaluateSecurityScan(
  pipeline: SecurityPipeline,
  cases: readonly SecurityEvalCase[],
): Promise<{
  cases: SecurityEvalScores[];
  meanPrecision: number;
  meanRecall: number;
  meanF1: number;
}> {
  const scores: SecurityEvalScores[] = [];
  for (const testCase of cases) {
    const report = await pipeline.scan(securityContext(testCase.files));
    const predicted = predictedIds(report.findings);
    const scored = scoreCase(predicted, testCase.expectedRuleIds);
    scores.push({
      id: testCase.id,
      predicted,
      expected: testCase.expectedRuleIds,
      ...scored,
    });
  }
  const mean = (select: (row: SecurityEvalScores) => number): number =>
    scores.reduce((sum, row) => sum + select(row), 0) / Math.max(1, scores.length);
  return {
    cases: scores,
    meanPrecision: mean((row) => row.precision),
    meanRecall: mean((row) => row.recall),
    meanF1: mean((row) => row.f1),
  };
}

export function securityBenchmarkCases(): SecurityEvalCase[] {
  return [
    {
      id: "eval-sink",
      files: [{ path: "src/a.ts", content: "export function run(x: string) { eval(x); }\n" }],
      expectedRuleIds: ["sast.eval"],
    },
    {
      id: "sql-injection",
      files: [
        {
          path: "src/db.ts",
          content:
            "export function find(req: { query: { id: string } }) { query(`SELECT * FROM t WHERE id = ${req.query.id}`); }\n",
        },
      ],
      expectedRuleIds: ["injection.sql"],
    },
    {
      id: "hardcoded-secret",
      files: [{ path: "src/cfg.ts", content: 'export const password = "hunter2secret";\n' }],
      expectedRuleIds: ["secret.hardcoded"],
    },
    {
      id: "weak-hash",
      files: [
        {
          path: "src/hash.ts",
          content: 'import { createHash } from "crypto";\ncreateHash("md5").update(password);\n',
        },
      ],
      expectedRuleIds: ["api.weak-hash"],
    },
    {
      id: "clean-module",
      files: [
        {
          path: "src/ok.ts",
          content: 'export function add(a: number, b: number) { return a + b; }\n',
        },
      ],
      expectedRuleIds: [],
    },
    {
      id: "vulnerable-lodash",
      files: [
        {
          path: "package.json",
          content: JSON.stringify({ dependencies: { lodash: "4.17.20" } }),
        },
      ],
      expectedRuleIds: ["dependency.advisory"],
    },
  ];
}
