import { describe, it, expect } from "vitest";
import { isDirty } from "../dirty";

describe("isDirty (UX-029)", () => {
  it("is false for equal drafts, including a new object", () => {
    expect(isDirty({ a: "1", b: null }, { a: "1", b: null })).toBe(false);
  });

  it("is true when a field changes, appears or disappears", () => {
    expect(isDirty({ a: "1" }, { a: "2" })).toBe(true);
    expect(isDirty({ a: "1" }, { a: "1", b: true })).toBe(true);
    expect(isDirty<Record<string, string>>({ a: "1", b: "" }, { a: "1" })).toBe(
      true,
    );
  });
});
