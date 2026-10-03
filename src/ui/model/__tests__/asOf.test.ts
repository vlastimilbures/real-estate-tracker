// UX-059 (DR-015, DR-072, D-19): the As-of picker stays inside the projection window
// [baseDate, baseDate + horizon] and its "+N years" presets use the engine's EDATE.
import { describe, it, expect } from "vitest";
import { asOfBounds, clampAsOf, plusYears } from "../asOf";
import { isoDate } from "../../../engine";

const bounds = asOfBounds(isoDate("2026-06-07"), 30);

describe("asOfBounds", () => {
  it("is the base date to the end of the horizon", () => {
    expect(bounds.min.toISOString().slice(0, 10)).toBe("2026-06-07");
    expect(bounds.max.toISOString().slice(0, 10)).toBe("2056-06-07");
  });
});

describe("clampAsOf", () => {
  it("keeps a date inside the window", () => {
    const d = isoDate("2030-01-01");
    expect(clampAsOf(d, bounds)).toBe(d);
  });
  it("moves a date before the base date up to it", () => {
    expect(clampAsOf(isoDate("2024-01-01"), bounds)).toEqual(bounds.min);
  });
  it("moves a date past the horizon back to its end", () => {
    expect(clampAsOf(isoDate("2090-01-01"), bounds)).toEqual(bounds.max);
  });
});

describe("plusYears", () => {
  it("steps whole years like EDATE (29 Feb → 28 Feb)", () => {
    expect(plusYears(isoDate("2028-02-29"), 1).toISOString().slice(0, 10)).toBe(
      "2029-02-28",
    );
    expect(plusYears(isoDate("2026-10-01"), 5).toISOString().slice(0, 10)).toBe(
      "2031-10-01",
    );
  });
});
