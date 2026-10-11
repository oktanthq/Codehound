import { describe, expect, it } from "vitest";
import { modelFrom } from "./helpers.js";

describe("CIM component relationship model", () => {
  it("links components when their files import each other", async () => {
    const { query } = await modelFrom([
      {
        path: "src/users.service.ts",
        content: `@Injectable()\nexport class UsersService {\n  find() { return []; }\n}\n`,
      },
      {
        path: "src/users.controller.ts",
        content: `import { UsersService } from "./users.service.js";
@Controller("users")
export class UsersController {
  constructor(private readonly users: UsersService) {}
  @Get()
  list() { return this.users.find(); }
}
`,
      },
    ]);
    expect(query.byKind("module").some((entity) => entity.path === "src/users.controller.ts")).toBe(
      true,
    );
    expect(
      query
        .components()
        .some(
          (entity) =>
            entity.name === "UsersController" && entity.attributes.componentKind === "controller",
        ),
    ).toBe(true);
    expect(
      query
        .componentDependencies()
        .some((edge) => edge.from === "UsersController" && edge.to === "UsersService") ||
        query
          .componentDependencies()
          .some((edge) => edge.from === "UsersController" && edge.to === "users"),
    ).toBe(true);
  });
});
