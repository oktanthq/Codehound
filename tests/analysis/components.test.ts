import { describe, expect, it } from "vitest";
import { extractComponents } from "../../src/analysis/components.js";
import { parseTypeScript } from "../../src/analysis/parse.js";

describe("extractComponents", () => {
  it("treats each file as a module and classifies controllers and services", () => {
    const source = `
@Controller("users")
export class UsersController {}
@Injectable()
export class UsersService {}
`;
    const parsed = parseTypeScript("src/users/users.controller.ts", source, "TypeScript");
    expect(extractComponents("src/users/users.controller.ts", parsed.sourceFile)).toEqual([
      { name: "users", kind: "module", path: "src/users/users.controller.ts" },
      { name: "users", kind: "controller", path: "src/users/users.controller.ts" },
      { name: "UsersController", kind: "controller", path: "src/users/users.controller.ts" },
      { name: "UsersService", kind: "service", path: "src/users/users.controller.ts" },
    ]);
  });

  it("detects a function component from JSX", () => {
    const source = `
export function Button(props: { label: string }) {
  return <button>{props.label}</button>;
}
`;
    const parsed = parseTypeScript("src/Button.tsx", source, "TypeScript");
    expect(extractComponents("src/Button.tsx", parsed.sourceFile)).toEqual([
      { name: "Button", kind: "module", path: "src/Button.tsx" },
      { name: "Button", kind: "component", path: "src/Button.tsx" },
    ]);
  });
});
