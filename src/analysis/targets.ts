import type { AnalysisDocument } from "./types.js";

export const TARGET_LANGUAGES = ["TypeScript", "JavaScript"] as const;

export type TargetLanguage = (typeof TARGET_LANGUAGES)[number];

export type DetectedFramework = {
  name: "React" | "Express" | "Nest";
  reason: string;
};

export function isTargetLanguage(language: string | undefined): boolean {
  return language !== undefined && (TARGET_LANGUAGES as readonly string[]).includes(language);
}

export function detectFrameworks(documents: readonly AnalysisDocument[]): DetectedFramework[] {
  const frameworks: DetectedFramework[] = [];
  const hasComponent = documents.some((document) =>
    document.components.some((component) => component.kind === "component"),
  );
  const hasNest = documents.some((document) =>
    document.components.some(
      (component) => component.kind === "controller" || component.kind === "service",
    ),
  );
  const hasEndpoint = documents.some((document) => document.endpoints.length > 0);
  if (hasComponent) {
    frameworks.push({ name: "React", reason: "jsx component" });
  }
  if (hasNest) {
    frameworks.push({ name: "Nest", reason: "controller or service" });
  } else if (hasEndpoint) {
    frameworks.push({ name: "Express", reason: "router endpoint" });
  }
  return frameworks;
}
