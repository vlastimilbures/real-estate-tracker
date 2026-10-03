// Direct units for the date primitives every amortization month depends on
// (dates.ts:19,35). Currently only exercised indirectly — a regression here would
// mis-shift every schedule row before any parity test could localize it.
import { describe, it, expect } from "vitest";
import { edate, monthsBetween, isoDate } from "../dates";

describe("edate — end-of-month clamp", () => {
  it("Jan 31 + 1mo clamps to Feb 28 (2021 non-leap)", () => {
    const d = edate(isoDate("2021-01-31"), 1);
    expect(d.getUTCFullYear()).toBe(2021);
    expect(d.getUTCMonth()).toBe(1); // February (0-based)
    expect(d.getUTCDate()).toBe(28);
  });
  it("Jan 31 + 1mo clamps to Feb 29 in a leap year (2024)", () =>
    expect(edate(isoDate("2024-01-31"), 1).getUTCDate()).toBe(29));
});

describe("monthsBetween — day-of-month edge", () => {
  it("2021-01-17 → 2026-06-07 = 64 (not 65; the 7th precedes the 17th)", () =>
    expect(monthsBetween(isoDate("2021-01-17"), isoDate("2026-06-07"))).toBe(
      64,
    ));
  it("counts the month once the day-of-month is reached", () =>
    expect(monthsBetween(isoDate("2021-01-17"), isoDate("2026-06-17"))).toBe(
      65,
    ));
});
