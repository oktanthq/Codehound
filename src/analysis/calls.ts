import ts from "typescript";
import type { CallEdge } from "./types.js";

const MODULE_SCOPE = "<module>";

function isFunctionLikeInitializer(node: ts.Expression | undefined): boolean {
  return node !== undefined && (ts.isArrowFunction(node) || ts.isFunctionExpression(node));
}

function calleeName(expression: ts.Expression): string | undefined {
  if (ts.isIdentifier(expression)) {
    return expression.text;
  }
  if (ts.isPropertyAccessExpression(expression)) {
    const object = calleeName(expression.expression);
    const name = expression.name.text;
    return object === undefined ? name : `${object}.${name}`;
  }
  if (
    ts.isElementAccessExpression(expression) &&
    ts.isStringLiteralLike(expression.argumentExpression)
  ) {
    const object = calleeName(expression.expression);
    const name = expression.argumentExpression.text;
    return object === undefined ? name : `${object}.${name}`;
  }
  if (expression.kind === ts.SyntaxKind.SuperKeyword) {
    return "super";
  }
  if (expression.kind === ts.SyntaxKind.ThisKeyword) {
    return "this";
  }
  if (ts.isParenthesizedExpression(expression)) {
    return calleeName(expression.expression);
  }
  if (ts.isNonNullExpression(expression)) {
    return calleeName(expression.expression);
  }
  return undefined;
}

function isImportOrRequire(node: ts.CallExpression): boolean {
  if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
    return true;
  }
  return ts.isIdentifier(node.expression) && node.expression.text === "require";
}

function startLine(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

export function extractCalls(sourceFile: ts.SourceFile): CallEdge[] {
  const calls: CallEdge[] = [];
  const stack: string[] = [];

  function from(): string {
    return stack[stack.length - 1] ?? MODULE_SCOPE;
  }

  function enter(name: string, node: ts.Node): void {
    stack.push(name);
    ts.forEachChild(node, visit);
    stack.pop();
  }

  function visit(node: ts.Node): void {
    if (ts.isFunctionDeclaration(node) && node.name !== undefined) {
      enter(node.name.text, node);
      return;
    }
    if (ts.isFunctionExpression(node) && node.name !== undefined) {
      enter(node.name.text, node);
      return;
    }
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      isFunctionLikeInitializer(node.initializer)
    ) {
      enter(node.name.text, node);
      return;
    }
    if (ts.isClassDeclaration(node) && node.name !== undefined) {
      enter(node.name.text, node);
      return;
    }
    if (ts.isMethodDeclaration(node) && node.name !== undefined && ts.isIdentifier(node.name)) {
      const owner = stack[stack.length - 1];
      const name = owner === undefined ? node.name.text : `${owner}.${node.name.text}`;
      enter(name, node);
      return;
    }
    if (ts.isConstructorDeclaration(node)) {
      const owner = stack[stack.length - 1];
      const name = owner === undefined ? "constructor" : `${owner}.constructor`;
      enter(name, node);
      return;
    }
    if (ts.isCallExpression(node) && !isImportOrRequire(node)) {
      const to = calleeName(node.expression);
      if (to !== undefined) {
        calls.push({ from: from(), to, startLine: startLine(sourceFile, node) });
      }
    } else if (ts.isNewExpression(node)) {
      const to = calleeName(node.expression);
      if (to !== undefined) {
        calls.push({ from: from(), to, startLine: startLine(sourceFile, node) });
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return calls;
}
