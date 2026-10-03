// Checked array access (DR-052): in range returns the element, out of range throws.
import { describe, it, expect } from "vitest";
import { at } from "../arrays";

describe("at", () => {
  it("returns the element in range", () => {
    expect(at([1, 2, 3], 0)).toBe(1);
    expect(at([1, 2, 3], 2)).toBe(3);
  });
  it("throws an engine-invariant error out of range", () => {
    expect(() => at([1], 1)).toThrow(/Engine invariant broken/);
    expect(() => at([], -1)).toThrow(/out of range/);
  });
});
