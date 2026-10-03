// ADR 0099: the open-ended record a new valuation/lease succeeds, and the end date it gets.
import { describe, it, expect } from "vitest";
import { dayBefore, isoDate } from "../dates";
import { openPredecessor } from "../succession";

const iso = (d: Date) => d.toISOString().slice(0, 10);

describe("dayBefore", () => {
  it("steps back within a month", () =>
    expect(iso(dayBefore(isoDate("2026-07-15")))).toBe("2026-07-14"));
  it("crosses a month end", () =>
    expect(iso(dayBefore(isoDate("2026-07-01")))).toBe("2026-06-30"));
  it("crosses a year end", () =>
    expect(iso(dayBefore(isoDate("2026-01-01")))).toBe("2025-12-31"));
  it("lands on a leap day", () =>
    expect(iso(dayBefore(isoDate("2028-03-01")))).toBe("2028-02-29"));
  it("skips Feb 29 in a common year", () =>
    expect(iso(dayBefore(isoDate("2027-03-01")))).toBe("2027-02-28"));
});

interface Row {
  id: string;
  propertyId: string;
  start: Date;
  end?: Date | undefined;
}
const row = (id: string, start: string, end?: string, propertyId = "p1") => ({
  id,
  propertyId,
  start: isoDate(start),
  end: end === undefined ? undefined : isoDate(end),
});
const find = (rows: Row[], start: string, propertyId = "p1") =>
  openPredecessor(
    rows,
    propertyId,
    isoDate(start),
    (r) => r.start,
    (r) => r.end,
  )?.id;

describe("openPredecessor", () => {
  it("returns the open-ended row that starts before the new start", () =>
    expect(find([row("a", "2025-01-01")], "2026-07-01")).toBe("a"));

  it("ignores rows that already have an end date", () =>
    expect(
      find([row("a", "2025-01-01", "2025-12-31")], "2026-07-01"),
    ).toBeUndefined());

  it("picks the latest open start when several are open", () =>
    expect(
      find([row("b", "2025-06-01"), row("a", "2024-01-01")], "2026-07-01"),
    ).toBe("b"));

  it("needs a start strictly before the new start", () => {
    expect(find([row("a", "2026-07-01")], "2026-07-01")).toBeUndefined();
    expect(find([row("a", "2026-08-01")], "2026-07-01")).toBeUndefined();
  });

  it("ignores other properties' rows", () =>
    expect(
      find([row("a", "2025-01-01", undefined, "p2")], "2026-07-01"),
    ).toBeUndefined());

  it("returns nothing for no rows", () =>
    expect(find([], "2026-07-01")).toBeUndefined());
});
