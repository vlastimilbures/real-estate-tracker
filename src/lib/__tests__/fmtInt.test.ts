import { describe, expect, it } from "vitest";
import { fmtCzk, fmtInt } from "../format";

describe("fmtInt", () => {
  it("is the whole-Kč figure without the unit, as the bare fmtCzk wrote it", () => {
    const values = [
      "0",
      "-0",
      "-0.4",
      "0.5",
      "-0.5",
      "1.5",
      "-1.5",
      "999.5",
      "10000",
      "-28730000.49",
      "123456789012345678.5",
      "1e21",
      1,
      150,
      10_000,
    ];
    for (const v of values)
      expect(fmtInt(v)).toBe(fmtCzk(v, { suffix: false }));
    expect(fmtInt(28_730_000)).toBe("28 730 000");
    expect(fmtInt("-1.5")).toBe("−2");
  });
});
