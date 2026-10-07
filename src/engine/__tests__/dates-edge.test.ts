// Direct units for the date primitives every amortization month depends on
// (dates.ts:19,35). Currently only exercised indirectly — a regression here would
// mis-shift every schedule row before any parity test could localize it.
import { describe, it, expect } from "vitest";
import { calendarDay, edate, monthsBetween, isoDate, utc } from "../dates";

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

// ADR 0149 §5: one constructor with the full year. Date.UTC maps years 0–99 to 1900–1999.
describe("utc / isoDate — the full year", () => {
  it("year 99 stays year 99, not 1999 (#119)", () => {
    expect(utc(99, 3, 1).getUTCFullYear()).toBe(99);
    expect(isoDate("0099-03-01").getUTCFullYear()).toBe(99);
  });
  it("still rolls an out-of-range day over (edate and addDays rely on it)", () =>
    expect(utc(2026, 3, 0)).toEqual(isoDate("2026-02-28")));
});

describe("calendarDay — a day that exists, no roll-over", () => {
  it("builds a real day", () =>
    expect(calendarDay(2024, 2, 29)).toEqual(isoDate("2024-02-29")));
  it("refuses a day the month does not have", () => {
    expect(calendarDay(2026, 2, 29)).toBeNull();
    expect(calendarDay(2026, 4, 31)).toBeNull();
  });
  it("refuses month 0 and 13 and day 0", () => {
    expect(calendarDay(2026, 0, 1)).toBeNull();
    expect(calendarDay(2026, 13, 1)).toBeNull();
    expect(calendarDay(2026, 1, 0)).toBeNull();
  });
  it("keeps a two-digit year", () =>
    expect(calendarDay(50, 6, 1)?.getUTCFullYear()).toBe(50));
});
