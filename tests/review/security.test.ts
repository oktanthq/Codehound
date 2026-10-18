import { describe, expect, it } from "vitest";
import { detectSecurityRisks } from "../../src/review/security.js";
import { addedFile, contextOf } from "./helpers.js";

describe("security-risk detection", () => {
  it("flags eval, innerHTML, secrets, and shell execution", () => {
    const findings = detectSecurityRisks(
      contextOf([
        addedFile("src/unsafe.ts", [
          "eval(userInput);",
          "element.innerHTML = html;",
          "const password = 'hunter2';",
          "execSync(cmd);",
          "fetch('http://example.com');",
        ]),
      ]),
    );
    expect(findings.map((finding) => finding.ruleId)).toEqual(
      expect.arrayContaining([
        "security.eval",
        "security.xss",
        "security.secret",
        "security.shell",
        "security.http",
      ]),
    );
  });
});
