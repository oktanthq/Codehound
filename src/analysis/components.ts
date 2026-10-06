import { basename } from "node:path";
import ts from "typescript";
import type { DetectedComponent } from "./types.js";

function decoratorNames(node: ts.Node): string[] {
  if (!ts.canHaveDecorators(node)) {
    return [];
  }
  const names: string[] = [];
  for (const decorator of ts.getDecorators(node) ?? []) {
    if (ts.isIdentifier(decorator.expression)) {
      names.push(decorator.expression.text);
    } else if (
      ts.isCallExpression(decorator.expression) &&
      ts.isIdentifier(decorator.expression.expression)
    ) {
      names.push(decorator.expression.expression.text);
    }
  }
  return names;
}

function fileStem(path: string): string {
  return basename(path)
    .replace(/\.(d\.)?[cm]?[jt]sx?$/i, "")
    .replace(/\.(controller|service|component|module|test|spec)$/i, "");
}

function filenameKind(path: string): DetectedComponent["kind"] | undefined {
  const base = basename(path).toLowerCase();
  if (base.includes(".controller.")) {
    return "controller";
  }
  if (base.includes(".service.")) {
    return "service";
  }
  if (base.includes(".component.")) {
    return "component";
  }
  return undefined;
}

function containsJsx(node: ts.Node): boolean {
  let found = false;
  const visit = (current: ts.Node): void => {
    if (found) {
      return;
    }
    if (
      ts.isJsxElement(current) ||
      ts.isJsxSelfClosingElement(current) ||
      ts.isJsxFragment(current)
    ) {
      found = true;
      return;
    }
    ts.forEachChild(current, visit);
  };
  visit(node);
  return found;
}

function isPascalCase(name: string): boolean {
  return /^[A-Z][A-Za-z0-9]*$/.test(name);
}

export function extractComponents(path: string, sourceFile: ts.SourceFile): DetectedComponent[] {
  const components: DetectedComponent[] = [{ name: fileStem(path), kind: "module", path }];
  const fromFile = filenameKind(path);
  if (fromFile !== undefined) {
    components.push({ name: fileStem(path), kind: fromFile, path });
  }

  function visit(node: ts.Node): void {
    if (ts.isClassDeclaration(node) && node.name !== undefined) {
      const names = decoratorNames(node);
      if (names.includes("Controller")) {
        components.push({ name: node.name.text, kind: "controller", path });
      }
      if (names.includes("Injectable") || names.includes("Service")) {
        components.push({ name: node.name.text, kind: "service", path });
      }
      if (containsJsx(node) || names.includes("Component")) {
        components.push({ name: node.name.text, kind: "component", path });
      }
    }
    if (ts.isFunctionDeclaration(node) && node.name !== undefined && isPascalCase(node.name.text)) {
      if (containsJsx(node)) {
        components.push({ name: node.name.text, kind: "component", path });
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  const seen = new Set<string>();
  return components.filter((component) => {
    const key = `${component.kind}:${component.name}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
