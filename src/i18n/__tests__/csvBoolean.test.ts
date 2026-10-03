// ADR 0113: the CSV boolean error names every spelling the parser accepts
// (src/import/csv.ts optBool), in all three languages.
import { describe, it, expect } from "vitest";
import { en } from "../en";
import { cs } from "../cs";
import { ru } from "../ru";

describe("errInvalidBoolean", () => {
  it("English lists every accepted value", () => {
    expect(en.importPage.errInvalidBoolean("maybe")).toBe(
      'Invalid boolean "maybe" — use true/false, yes/no or 1/0',
    );
  });

  it.each([
    ["en", en],
    ["cs", cs],
    ["ru", ru],
  ])("%s names the value and true/false, yes/no, 1/0", (_, d) => {
    const msg = d.importPage.errInvalidBoolean("maybe");
    for (const s of ["maybe", "true/false", "yes/no", "1/0"])
      expect(msg).toContain(s);
  });
});
