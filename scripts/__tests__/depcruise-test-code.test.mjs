// App code never imports test code (#480): the engine's test seams left the public barrel
// for src/engine/__tests__/support/seams.ts, and this rule keeps them, and every other
// fixture or support file, out of the app.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { forbidden } = require("../../.dependency-cruiser.cjs");
const rule = forbidden.find((r) => r.name === "test-code-tests-only");
const matches = (re, path) => new RegExp(re).test(path);

describe("the test-code-tests-only rule in .dependency-cruiser.cjs", () => {
  it("is an error", () => {
    expect(rule).toBeDefined();
    expect(rule.severity).toBe("error");
  });

  it("refuses an app module's import of the engine's test seams", () => {
    expect(matches(rule.from.path, "src/ui/model/compare.ts")).toBe(true);
    expect(matches(rule.from.pathNot, "src/ui/model/compare.ts")).toBe(false);
    expect(matches(rule.to.path, "src/engine/__tests__/support/seams.ts")).toBe(
      true,
    );
  });

  it("lets a test import them", () => {
    for (const test of [
      "src/ui/model/__tests__/compare.test.ts",
      "src/engine/__tests__/support/mixed.ts",
      "src/data/x.test.ts",
    ])
      expect(matches(rule.from.pathNot, test), test).toBe(true);
  });
});
