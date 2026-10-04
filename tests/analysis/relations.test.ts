import { describe, expect, it } from "vitest";
import { parseTypeScript } from "../../src/analysis/parse.js";
import { extractRelations } from "../../src/analysis/relations.js";

describe("extractRelations", () => {
  it("extracts class heritage, interface extends, and type aliases", () => {
    const source = `
class Animal {}
interface Named {
  name: string;
}
interface Identified extends Named {}
class Dog extends Animal implements Named, Identified {}
type Id = string | number;
type Pet = Dog & Named;
`;
    const parsed = parseTypeScript("src/types.ts", source, "TypeScript");
    expect(extractRelations(parsed.sourceFile)).toEqual([
      { from: "Identified", kind: "extends", to: "Named" },
      { from: "Dog", kind: "extends", to: "Animal" },
      { from: "Dog", kind: "implements", to: "Named" },
      { from: "Dog", kind: "implements", to: "Identified" },
      { from: "Pet", kind: "alias", to: "Dog" },
      { from: "Pet", kind: "alias", to: "Named" },
    ]);
  });
});
