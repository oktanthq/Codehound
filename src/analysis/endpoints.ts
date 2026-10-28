import ts from "typescript";
import type { ApiEndpoint } from "./types.js";

const ROUTER_METHODS: Record<string, string> = {
  get: "GET",
  post: "POST",
  put: "PUT",
  patch: "PATCH",
  delete: "DELETE",
  options: "OPTIONS",
  head: "HEAD",
  all: "ALL",
  use: "USE",
};

const DECORATOR_METHODS: Record<string, string> = {
  Get: "GET",
  Post: "POST",
  Put: "PUT",
  Patch: "PATCH",
  Delete: "DELETE",
  Options: "OPTIONS",
  Head: "HEAD",
  All: "ALL",
};

function stringLiteral(node: ts.Expression | undefined): string | undefined {
  if (node !== undefined && ts.isStringLiteralLike(node)) {
    return node.text;
  }
  return undefined;
}

function identifierName(node: ts.Expression | undefined): string | undefined {
  if (node !== undefined && ts.isIdentifier(node)) {
    return node.text;
  }
  return undefined;
}

function decoratorName(decorator: ts.Decorator): {
  name: string;
  argument: ts.Expression | undefined;
} {
  if (
    ts.isCallExpression(decorator.expression) &&
    ts.isIdentifier(decorator.expression.expression)
  ) {
    return {
      name: decorator.expression.expression.text,
      argument: decorator.expression.arguments[0],
    };
  }
  if (ts.isIdentifier(decorator.expression)) {
    return { name: decorator.expression.text, argument: undefined };
  }
  return { name: "", argument: undefined };
}

function decoratorsOf(node: ts.Node): readonly ts.Decorator[] {
  if (ts.canHaveDecorators(node)) {
    return ts.getDecorators(node) ?? [];
  }
  return [];
}

function joinPaths(prefix: string | undefined, path: string | undefined): string {
  const parts = [prefix, path]
    .filter((part): part is string => part !== undefined && part.trim().length > 0)
    .map((part) => part.replace(/^\/+|\/+$/g, ""))
    .filter((part) => part.length > 0);
  if (parts.length === 0) {
    return "/";
  }
  return `/${parts.join("/")}`;
}

function startLine(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function controllerPrefix(node: ts.ClassDeclaration): string | undefined {
  for (const decorator of decoratorsOf(node)) {
    const parsed = decoratorName(decorator);
    if (parsed.name === "Controller") {
      return stringLiteral(parsed.argument) ?? "";
    }
  }
  return undefined;
}

export function extractEndpoints(sourceFile: ts.SourceFile): ApiEndpoint[] {
  const endpoints: ApiEndpoint[] = [];

  function visit(node: ts.Node): void {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.name)
    ) {
      const method = ROUTER_METHODS[node.expression.name.text.toLowerCase()];
      const path = stringLiteral(node.arguments[0]);
      if (method !== undefined && path !== undefined) {
        endpoints.push({
          method,
          path: joinPaths(undefined, path),
          handler: identifierName(node.arguments[1]),
          startLine: startLine(sourceFile, node),
        });
      }
    }

    if (ts.isClassDeclaration(node)) {
      const prefix = controllerPrefix(node);
      if (prefix !== undefined) {
        for (const member of node.members) {
          if (
            !ts.isMethodDeclaration(member) ||
            member.name === undefined ||
            !ts.isIdentifier(member.name)
          ) {
            continue;
          }
          for (const decorator of decoratorsOf(member)) {
            const parsed = decoratorName(decorator);
            const method = DECORATOR_METHODS[parsed.name];
            if (method === undefined) {
              continue;
            }
            endpoints.push({
              method,
              path: joinPaths(prefix, stringLiteral(parsed.argument)),
              handler: member.name.text,
              startLine: startLine(sourceFile, member),
            });
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return endpoints;
}
