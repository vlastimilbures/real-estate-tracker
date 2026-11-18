// The engine never imports src/platform (CLAUDE.md §4, #499). engine-pure-layers does not
// cover platform (scripts/engine-layers.cjs leaves it out of LAYERS), so this named rule
// is the only thing that enforces it, the engine tests included. ESLint's engine import
// hint is built from the same LAYERS and does not flag platform either.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { forbidden } = require("../../.dependency-cruiser.cjs");
const rule = forbidden.find((r) => r.name === "engine-no-platform");

describe("the engine-no-platform rule in .dependency-cruiser.cjs", () => {
  it("is an error from every engine file, tests included, to src/platform", () => {
    expect(rule).toBeDefined();
    expect(rule.severity).toBe("error");
    expect(rule.from).toEqual({ path: "^src/engine/" });
    expect(rule.from).not.toHaveProperty("pathNot");
    expect(rule.to).toEqual({ path: "^src/platform/" });
  });

  it("matches an engine test's import of a platform module", () => {
    expect(
      new RegExp(rule.from.path).test("src/engine/__tests__/x.test.ts"),
    ).toBe(true);
    expect(new RegExp(rule.to.path).test("src/platform/saveFile.ts")).toBe(
      true,
    );
  });
});
