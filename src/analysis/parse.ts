import ts from "typescript";

export type ParsedSource = {
  path: string;
  language: string;
  sourceFile: ts.SourceFile;
  diagnostics: readonly ts.Diagnostic[];
};

function scriptKindFor(path: string): ts.ScriptKind {
  const lower = path.toLowerCase();
  if (lower.endsWith(".tsx")) {
    return ts.ScriptKind.TSX;
  }
  if (lower.endsWith(".jsx")) {
    return ts.ScriptKind.JSX;
  }
  if (lower.endsWith(".js") || lower.endsWith(".mjs") || lower.endsWith(".cjs")) {
    return ts.ScriptKind.JS;
  }
  return ts.ScriptKind.TS;
}

export function parseTypeScript(path: string, content: string, language: string): ParsedSource {
  const compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    noEmit: true,
    noLib: true,
    skipLibCheck: true,
    allowJs: true,
  };
  const sourceFile = ts.createSourceFile(
    path,
    content,
    ts.ScriptTarget.ES2022,
    true,
    scriptKindFor(path),
  );
  const host: ts.CompilerHost = {
    getSourceFile: (fileName) => (fileName === path ? sourceFile : undefined),
    getDefaultLibFileName: () => "lib.d.ts",
    writeFile: () => undefined,
    getCurrentDirectory: () => "",
    getDirectories: () => [],
    getCanonicalFileName: (fileName) => fileName,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => "\n",
    fileExists: (fileName) => fileName === path,
    readFile: (fileName) => (fileName === path ? content : undefined),
  };
  const program = ts.createProgram([path], compilerOptions, host);
  const parsed = program.getSourceFile(path) ?? sourceFile;
  return {
    path,
    language,
    sourceFile: parsed,
    diagnostics: program.getSyntacticDiagnostics(parsed),
  };
}

export function formatDiagnostics(diagnostics: readonly ts.Diagnostic[]): string {
  return ts
    .formatDiagnostics(diagnostics, {
      getCanonicalFileName: (fileName) => fileName,
      getCurrentDirectory: () => "",
      getNewLine: () => "\n",
    })
    .trim();
}
