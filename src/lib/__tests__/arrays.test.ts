// Checked array access (DR-052, ADR 0074): in range returns the element, out of range throws.
import { describe, it, expect } from "vitest";
import { at } from "../arrays";

describe("at", () => {
  it("returns the element in range", () => {
    expect(at(["a", "b", "c"], 0)).toBe("a");
    expect(at(["a", "b", "c"], 2)).toBe("c");
  });
  it("throws out of range", () => {
    expect(() => at([1], 1)).toThrow(/index 1 out of range \(length 1\)/);
    expect(() => at([], -1)).toThrow(/Invariant broken/);
  });
});
