// `pnpm depcruise:baseline-check` (ADR 0072): the base ref it picks and the entries it calls
// new. Pure functions only; the git read runs only from main().
import { describe, expect, it } from "vitest";
import { addedEntries, baseRef, key } from "../check-depcruise-baseline.mjs";

const v = (rule, from, to) => ({
  rule: { name: rule, severity: "error" },
  from,
  to,
});
const CYCLE = v("no-circular", "src/a.ts", "src/b.ts");
const LAYER = v("engine-pure", "src/engine/x.ts", "src/data/y.ts");

describe("baseRef", () => {
  it("takes the argument first", () => {
    expect(baseRef(["main~3"], { GITHUB_BASE_REF: "release" })).toBe("main~3");
  });
  it("falls back to the pull request's base branch on origin", () => {
    expect(baseRef([], { GITHUB_BASE_REF: "release" })).toBe("origin/release");
  });
  it("defaults to origin/main, also when GITHUB_BASE_REF is empty", () => {
    expect(baseRef([], {})).toBe("origin/main");
    expect(baseRef([], { GITHUB_BASE_REF: "" })).toBe("origin/main");
  });
});

describe("key", () => {
  it("names the rule, the source and the target", () => {
    expect(key(CYCLE)).toBe("no-circular: src/a.ts → src/b.ts");
  });
});

describe("addedEntries", () => {
  it("passes an unchanged or empty baseline", () => {
    expect(addedEntries([], [])).toEqual([]);
    expect(addedEntries([CYCLE, LAYER], [LAYER, CYCLE])).toEqual([]);
  });
  it("passes a shrinking baseline", () => {
    expect(addedEntries([CYCLE, LAYER], [LAYER])).toEqual([]);
  });
  it("reports each new entry", () => {
    expect(addedEntries([CYCLE], [CYCLE, LAYER])).toEqual([key(LAYER)]);
    expect(addedEntries([], [CYCLE, LAYER])).toEqual([key(CYCLE), key(LAYER)]);
  });
  it("compares rule, from and to, not the rest of the entry", () => {
    const sameButWarn = {
      ...CYCLE,
      rule: { name: "no-circular", severity: "warn" },
    };
    expect(addedEntries([CYCLE], [sameButWarn])).toEqual([]);
    const otherRule = v("engine-pure", "src/a.ts", "src/b.ts");
    const otherTo = v("no-circular", "src/a.ts", "src/c.ts");
    expect(addedEntries([CYCLE], [otherRule, otherTo])).toEqual([
      key(otherRule),
      key(otherTo),
    ]);
  });
});
