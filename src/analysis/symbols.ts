import ts from "typescript";
import type { AnalysisSymbol } from "./types.js";

function range(sourceFile: ts.SourceFile, node: ts.Node): { startLine: number; endLine: number } {
  const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
  return { startLine: start.line + 1, endLine: end.line + 1 };
}

function isFunctionLikeInitializer(node: ts.Expression | undefined): boolean {
  return node !== undefined && (ts.isArrowFunction(node) || ts.isFunctionExpression(node));
}

export function extractSymbols(sourceFile: ts.SourceFile): AnalysisSymbol[] {
  const symbols: AnalysisSymbol[] = [];

  function visit(node: ts.Node): void {
    if (ts.isFunctionDeclaration(node) && node.name !== undefined) {
      symbols.push({ name: node.name.text, kind: "function", ...range(sourceFile, node) });
    } else if (ts.isClassDeclaration(node) && node.name !== undefined) {
      symbols.push({ name: node.name.text, kind: "class", ...range(sourceFile, node) });
    } else if (ts.isInterfaceDeclaration(node)) {
      symbols.push({ name: node.name.text, kind: "interface", ...range(sourceFile, node) });
    } else if (ts.isTypeAliasDeclaration(node)) {
      symbols.push({ name: node.name.text, kind: "type", ...range(sourceFile, node) });
    } else if (ts.isEnumDeclaration(node)) {
      symbols.push({ name: node.name.text, kind: "enum", ...range(sourceFile, node) });
    } else if (ts.isModuleDeclaration(node) && ts.isIdentifier(node.name)) {
      symbols.push({ name: node.name.text, kind: "namespace", ...range(sourceFile, node) });
    } else if (
      ts.isMethodDeclaration(node) &&
      node.name !== undefined &&
      ts.isIdentifier(node.name)
    ) {
      symbols.push({ name: node.name.text, kind: "method", ...range(sourceFile, node) });
    } else if (ts.isConstructorDeclaration(node)) {
      symbols.push({ name: "constructor", kind: "constructor", ...range(sourceFile, node) });
    } else if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          symbols.push({
            name: declaration.name.text,
            kind: isFunctionLikeInitializer(declaration.initializer) ? "function" : "variable",
            ...range(sourceFile, declaration),
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return symbols;
}
