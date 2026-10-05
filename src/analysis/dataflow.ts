import ts from "typescript";
import type { DataFlowEdge } from "./types.js";

function identifierText(node: ts.Node | undefined): string | undefined {
  if (node !== undefined && ts.isIdentifier(node)) {
    return node.text;
  }
  return undefined;
}

function calleeName(expression: ts.Expression): string | undefined {
  if (ts.isIdentifier(expression)) {
    return expression.text;
  }
  if (ts.isPropertyAccessExpression(expression)) {
    const object = calleeName(expression.expression);
    return object === undefined ? expression.name.text : `${object}.${expression.name.text}`;
  }
  return undefined;
}

function startLine(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function assignmentTarget(node: ts.Expression): string | undefined {
  const ident = identifierText(node);
  if (ident !== undefined) {
    return ident;
  }
  if (ts.isPropertyAccessExpression(node)) {
    const object = assignmentTarget(node.expression);
    return object === undefined ? node.name.text : `${object}.${node.name.text}`;
  }
  return undefined;
}

export function extractDataFlows(sourceFile: ts.SourceFile): DataFlowEdge[] {
  const flows: DataFlowEdge[] = [];

  function visit(node: ts.Node): void {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer !== undefined
    ) {
      const from = identifierText(node.initializer);
      if (from !== undefined) {
        flows.push({
          from,
          to: node.name.text,
          kind: "assign",
          startLine: startLine(sourceFile, node),
        });
      }
    } else if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken
    ) {
      const to = assignmentTarget(node.left);
      const from = identifierText(node.right);
      if (to !== undefined && from !== undefined) {
        flows.push({ from, to, kind: "assign", startLine: startLine(sourceFile, node) });
      }
    } else if (ts.isReturnStatement(node)) {
      const from = identifierText(node.expression);
      if (from !== undefined) {
        flows.push({
          from,
          to: "<return>",
          kind: "return",
          startLine: startLine(sourceFile, node),
        });
      }
    } else if (ts.isCallExpression(node)) {
      const callee = calleeName(node.expression);
      if (callee !== undefined) {
        for (const argument of node.arguments) {
          const from = identifierText(argument);
          if (from !== undefined) {
            flows.push({
              from,
              to: callee,
              kind: "argument",
              startLine: startLine(sourceFile, argument),
            });
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return flows;
}
