import { dirname, join, normalize } from "node:path";
import type { AnalysisDocument, CrossFileLink } from "./types.js";

const INDEX_FILES = ["index.ts", "index.tsx", "index.js", "index.jsx", "index.mts", "index.mjs"];
const EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"];

function normalizePath(path: string): string {
  return normalize(path).replaceAll("\\", "/");
}

function stripKnownExtension(path: string): string {
  const lower = path.toLowerCase();
  for (const extension of EXTENSIONS) {
    if (lower.endsWith(extension)) {
      return path.slice(0, -extension.length);
    }
  }
  return path;
}

function candidatesFor(fromPath: string, specifier: string): string[] {
  if (!specifier.startsWith("./") && !specifier.startsWith("../")) {
    return [];
  }
  const resolved = normalizePath(join(dirname(fromPath), specifier));
  const withoutExt = stripKnownExtension(resolved);
  const values = [resolved, withoutExt];
  for (const extension of EXTENSIONS) {
    values.push(`${withoutExt}${extension}`);
  }
  for (const index of INDEX_FILES) {
    values.push(normalizePath(join(withoutExt, index)));
  }
  return values;
}

export function linkDocuments(documents: readonly AnalysisDocument[]): CrossFileLink[] {
  const byPath = new Map(documents.map((document) => [normalizePath(document.path), document]));
  const links: CrossFileLink[] = [];
  for (const document of documents) {
    for (const imported of document.imports) {
      for (const candidate of candidatesFor(document.path, imported.source)) {
        if (byPath.has(candidate)) {
          links.push({
            fromPath: document.path,
            toPath: byPath.get(candidate)?.path ?? candidate,
            kind: "import",
            specifier: imported.source,
          });
          break;
        }
      }
    }
  }
  return links;
}
