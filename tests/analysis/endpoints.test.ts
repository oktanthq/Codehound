import { describe, expect, it } from "vitest";
import { extractEndpoints } from "../../src/analysis/endpoints.js";
import { parseTypeScript } from "../../src/analysis/parse.js";

describe("extractEndpoints", () => {
  it("extracts router-style handlers", () => {
    const source = `
app.get("/users", listUsers);
router.post("/users/:id", updateUser);
app.use("/api", middleware);
app.get(pathVariable, nope);
`;
    const parsed = parseTypeScript("src/http.ts", source, "TypeScript");
    expect(extractEndpoints(parsed.sourceFile)).toEqual([
      { method: "GET", path: "/users", handler: "listUsers", startLine: 2 },
      { method: "POST", path: "/users/:id", handler: "updateUser", startLine: 3 },
      { method: "USE", path: "/api", handler: "middleware", startLine: 4 },
    ]);
  });

  it("extracts controller method decorators", () => {
    const source = `
@Controller("users")
class UsersController {
  @Get()
  list() {}
  @Get(":id")
  show() {}
  @Post()
  create() {}
}
`;
    const parsed = parseTypeScript("src/users.controller.ts", source, "TypeScript");
    expect(extractEndpoints(parsed.sourceFile)).toEqual([
      { method: "GET", path: "/users", handler: "list", startLine: 4 },
      { method: "GET", path: "/users/:id", handler: "show", startLine: 6 },
      { method: "POST", path: "/users", handler: "create", startLine: 8 },
    ]);
  });
});
