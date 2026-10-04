import ts from "typescript";
import type { TypeRelation } from "./types.js";

function entityName(name: ts.EntityName): string {
  if (ts.isIdentifier(name)) {
    return name.text;
  }
  return `${entityName(name.left)}.${name.right.text}`;
}

function expressionName(expression: ts.Expression): string | undefined {
  if (ts.isIdentifier(expression)) {
    return expression.text;
  }
  if (ts.isPropertyAccessExpression(expression)) {
    const left = expressionName(expression.expression);
    return left === undefined ? expression.name.text : `${left}.${expression.name.text}`;
  }
  return undefined;
}

function heritageName(node: ts.ExpressionWithTypeArguments): string | undefined {
  return expressionName(node.expression);
}

function collectTypeNames(node: ts.TypeNode, names: string[]): void {
  if (ts.isTypeReferenceNode(node)) {
    names.push(entityName(node.typeName));
    return;
  }
  if (ts.isUnionTypeNode(node) || ts.isIntersectionTypeNode(node)) {
    for (const part of node.types) {
      collectTypeNames(part, names);
    }
    return;
  }
  if (ts.isParenthesizedTypeNode(node)) {
    collectTypeNames(node.type, names);
    return;
  }
  if (ts.isArrayTypeNode(node)) {
    collectTypeNames(node.elementType, names);
    return;
  }
  if (ts.isTypeOperatorNode(node)) {
    collectTypeNames(node.type, names);
  }
}

export function extractRelations(sourceFile: ts.SourceFile): TypeRelation[] {
  const relations: TypeRelation[] = [];

  function visit(node: ts.Node): void {
    if (ts.isClassDeclaration(node) && node.name !== undefined) {
      const from = node.name.text;
      for (const clause of node.heritageClauses ?? []) {
        const kind = clause.token === ts.SyntaxKind.ExtendsKeyword ? "extends" : "implements";
        for (const type of clause.types) {
          const to = heritageName(type);
          if (to !== undefined) {
            relations.push({ from, kind, to });
          }
        }
      }
    } else if (ts.isInterfaceDeclaration(node)) {
      const from = node.name.text;
      for (const clause of node.heritageClauses ?? []) {
        for (const type of clause.types) {
          const to = heritageName(type);
          if (to !== undefined) {
            relations.push({ from, kind: "extends", to });
          }
        }
      }
    } else if (ts.isTypeAliasDeclaration(node)) {
      const names: string[] = [];
      collectTypeNames(node.type, names);
      for (const to of names) {
        relations.push({ from: node.name.text, kind: "alias", to });
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return relations;
}
