import type { LanguageAdapter } from "./adapter.js";
import { formatDiagnostics, parseTypeScript } from "./parse.js";
import { extractCalls } from "./calls.js";
import { extractImports } from "./imports.js";
import { extractSymbols } from "./symbols.js";
import type { AnalysisContext, AnalysisDocument, AnalysisFile } from "./types.js";

export class TypeScriptLanguageAdapter implements LanguageAdapter {
  readonly id = "typescript";
  readonly languages = ["TypeScript", "JavaScript"] as const;

  async analyze(file: AnalysisFile, _context: AnalysisContext): Promise<AnalysisDocument> {
    if (file.content === undefined) {
      throw new Error(`missing source content for ${file.path}`);
    }
    const language = file.language ?? "TypeScript";
    const parsed = parseTypeScript(file.path, file.content, language);
    if (parsed.diagnostics.length > 0) {
      throw new Error(formatDiagnostics(parsed.diagnostics));
    }
    return {
      path: file.path,
      language,
      adapterId: this.id,
      symbols: extractSymbols(parsed.sourceFile),
      imports: extractImports(parsed.sourceFile),
      calls: extractCalls(parsed.sourceFile),
    };
  }
}
