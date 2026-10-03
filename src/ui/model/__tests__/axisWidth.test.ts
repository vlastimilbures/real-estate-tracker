// Y-axis width must fit the longest tick, including a minus sign on negative values, so
// "−200 k" never wraps.
import { describe, it, expect } from "vitest";
import { czkAxisWidth } from "../chartData";
import { pickCzkAxisUnit } from "../../../lib/format";

describe("czkAxisWidth", () => {
  const rows = [{ v: 600_000 }, { v: -200_000 }];
  const unit = pickCzkAxisUnit([600_000, -200_000], "k");

  it("counts the minus sign of the most negative value", () => {
    // "−200 k" (6 chars) is longer than "600 k" (5 chars): 6 × 8 + 8.
    expect(czkAxisWidth(unit, rows, ["v"])).toBe(56);
  });

  it("uses the largest positive tick when there are no negatives", () => {
    expect(czkAxisWidth(unit, [{ v: 600_000 }], ["v"])).toBe(48);
  });

  it("never goes below 44 px", () => {
    expect(czkAxisWidth(pickCzkAxisUnit([0]), [{ v: 0 }], ["v"])).toBe(44);
  });
});
