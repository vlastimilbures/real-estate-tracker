// Scenario compare selection helpers (ADR 0093).
import { describe, it, expect } from "vitest";
import { tickForCompare } from "../compareSelection";

describe("tickForCompare", () => {
  it("adds the id while fewer than max are ticked", () => {
    expect(tickForCompare(["a"], "b", 3)).toEqual({
      ids: ["a", "b"],
      ticked: true,
    });
  });

  it("keeps the selection unchanged at the limit", () => {
    const ids = ["a", "b", "c"];
    const out = tickForCompare(ids, "d", 3);
    expect(out).toEqual({ ids: ["a", "b", "c"], ticked: false });
    expect(out.ids).toBe(ids);
  });

  it("treats an already ticked id as ticked, also at the limit", () => {
    const ids = ["a", "b", "c"];
    const out = tickForCompare(ids, "b", 3);
    expect(out).toEqual({ ids: ["a", "b", "c"], ticked: true });
    expect(out.ids).toBe(ids);
  });
});
