import ts from "typescript";
import type { AnalysisImport } from "./types.js";

function stringLiteral(node: ts.Expression | undefined): string | undefined {
  if (node !== undefined && ts.isStringLiteralLike(node)) {
    return node.text;
  }
  return undefined;
}

export function extractImports(sourceFile: ts.SourceFile): AnalysisImport[] {
  const imports: AnalysisImport[] = [];

  function add(source: string | undefined, kind: AnalysisImport["kind"]): void {
    if (source === undefined) {
      return;
    }
    imports.push({ source, kind });
  }

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node)) {
      add(stringLiteral(node.moduleSpecifier), "import");
    } else if (ts.isExportDeclaration(node)) {
      add(stringLiteral(node.moduleSpecifier), "export");
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      add(stringLiteral(node.moduleReference.expression), "require");
    } else if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        add(stringLiteral(node.arguments[0]), "dynamic");
      } else if (ts.isIdentifier(node.expression) && node.expression.text === "require") {
        add(stringLiteral(node.arguments[0]), "require");
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return imports;
}
