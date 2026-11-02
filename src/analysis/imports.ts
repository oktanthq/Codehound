import ts from "typescript";
import type { AnalysisImport } from "./types.js";

export type ImportBinding = {
  source: string;
  kind: AnalysisImport["kind"];
  local: string;
  imported: string;
};

function stringLiteral(node: ts.Expression | undefined): string | undefined {
  if (node !== undefined && ts.isStringLiteralLike(node)) {
    return node.text;
  }
  return undefined;
}

function requireSource(expression: ts.Expression): string | undefined {
  if (ts.isCallExpression(expression)) {
    if (expression.expression.kind === ts.SyntaxKind.ImportKeyword) {
      return stringLiteral(expression.arguments[0]);
    }
    if (ts.isIdentifier(expression.expression) && expression.expression.text === "require") {
      return stringLiteral(expression.arguments[0]);
    }
  }
  if (ts.isAwaitExpression(expression)) {
    return requireSource(expression.expression);
  }
  if (ts.isParenthesizedExpression(expression)) {
    return requireSource(expression.expression);
  }
  return undefined;
}

function requireMember(
  expression: ts.Expression,
): { source: string; imported: string | undefined; kind: AnalysisImport["kind"] } | undefined {
  const source = requireSource(expression);
  if (source !== undefined) {
    const kind =
      ts.isAwaitExpression(expression) ||
      (ts.isCallExpression(expression) &&
        expression.expression.kind === ts.SyntaxKind.ImportKeyword)
        ? "dynamic"
        : "require";
    return { source, imported: undefined, kind };
  }
  if (ts.isPropertyAccessExpression(expression)) {
    const inner = requireMember(expression.expression);
    if (inner === undefined) {
      return undefined;
    }
    return { source: inner.source, imported: expression.name.text, kind: inner.kind };
  }
  if (ts.isParenthesizedExpression(expression)) {
    return requireMember(expression.expression);
  }
  return undefined;
}

function addBoundName(
  bindings: ImportBinding[],
  name: ts.BindingName,
  source: string,
  imported: string,
  kind: AnalysisImport["kind"],
): void {
  if (ts.isIdentifier(name)) {
    bindings.push({ source, kind, local: name.text, imported });
    return;
  }
  if (!ts.isObjectBindingPattern(name)) {
    return;
  }
  for (const element of name.elements) {
    if (element.dotDotDotToken !== undefined || !ts.isIdentifier(element.name)) {
      continue;
    }
    const importedName =
      element.propertyName !== undefined && ts.isIdentifier(element.propertyName)
        ? element.propertyName.text
        : element.name.text;
    bindings.push({ source, kind, local: element.name.text, imported: importedName });
  }
}

export function extractImportBindings(sourceFile: ts.SourceFile): ImportBinding[] {
  const bindings: ImportBinding[] = [];

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node)) {
      const source = stringLiteral(node.moduleSpecifier);
      const clause = node.importClause;
      if (source !== undefined && clause !== undefined && !clause.isTypeOnly) {
        if (clause.name !== undefined) {
          bindings.push({ source, kind: "import", local: clause.name.text, imported: "default" });
        }
        if (clause.namedBindings !== undefined) {
          if (ts.isNamespaceImport(clause.namedBindings)) {
            bindings.push({
              source,
              kind: "import",
              local: clause.namedBindings.name.text,
              imported: "*",
            });
          } else {
            for (const element of clause.namedBindings.elements) {
              if (element.isTypeOnly) {
                continue;
              }
              const importedName =
                element.propertyName === undefined ? element.name.text : element.propertyName.text;
              bindings.push({
                source,
                kind: "import",
                local: element.name.text,
                imported: importedName,
              });
            }
          }
        }
      }
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      const source = stringLiteral(node.moduleReference.expression);
      if (source !== undefined) {
        bindings.push({ source, kind: "require", local: node.name.text, imported: "*" });
      }
    } else if (ts.isVariableDeclaration(node) && node.initializer !== undefined) {
      const required = requireMember(node.initializer);
      if (required !== undefined) {
        addBoundName(bindings, node.name, required.source, required.imported ?? "*", required.kind);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return bindings;
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
