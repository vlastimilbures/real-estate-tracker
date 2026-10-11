// ADR 0180 §7 (#276 item 3): the Dashboard stores the filter it shows once the saved one
// names a property that is no longer active.
import { describe, it, expect } from "vitest";
import { prunedFilter } from "../dashboard";

describe("prunedFilter", () => {
  const active = ["a", "b", "c"];

  it("leaves a filter of active properties alone", () => {
    expect(prunedFilter([], active)).toBeNull();
    expect(prunedFilter(["a"], active)).toBeNull();
    // Every active property picked by hand stays as picked.
    expect(prunedFilter(["a", "b", "c"], active)).toBeNull();
  });

  it("drops the ids of properties no longer active", () => {
    expect(prunedFilter(["a", "gone"], active)).toEqual(["a"]);
    expect(prunedFilter(["a", "b", "gone"], active)).toEqual(["a", "b"]);
  });

  it("becomes no filter when what is left filters nothing", () => {
    expect(prunedFilter(["gone"], active)).toEqual([]);
    expect(prunedFilter(["a", "b", "c", "gone"], active)).toEqual([]);
    expect(prunedFilter(["dev", "inactive"], ["dev"])).toEqual([]);
    expect(prunedFilter(["x"], [])).toEqual([]);
  });
});
