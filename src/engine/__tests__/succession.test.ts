// ADR 0099: the open-ended record a new valuation/lease succeeds, and the end date it gets.
// ADR 0227 and 0163: the one a new valuation and a new lease end.
import { describe, it, expect } from "vitest";
import { money } from "../brands";
import { dayBefore, isoDate } from "../dates";
import {
  leaseClosedBy,
  openPredecessor,
  valuationClosedBy,
} from "../effectiveDating";
import type { Lease, Valuation } from "../types";

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

describe("valuationClosedBy (ADR 0227, 0144)", () => {
  const open: Valuation = {
    id: "v1",
    propertyId: "p",
    validFrom: isoDate("2024-01-01"),
    marketValue: money(100),
  };
  const added: Valuation = {
    id: "v2",
    propertyId: "p",
    validFrom: isoDate("2026-03-01"),
    marketValue: money(200),
  };

  it("an open-ended new valuation ends the open one before it the day before", () => {
    expect(valuationClosedBy([open], added)).toEqual({
      ...open,
      validTo: isoDate("2026-02-28"),
    });
  });

  it("a dated one closes nothing (ADR 0144)", () => {
    expect(
      valuationClosedBy([open], { ...added, validTo: isoDate("2026-12-31") }),
    ).toBeUndefined();
  });

  it("nothing to close: the same start, one already ended, another property's, none", () => {
    expect(
      valuationClosedBy([open], { ...added, validFrom: open.validFrom }),
    ).toBeUndefined();
    expect(
      valuationClosedBy([{ ...open, validTo: isoDate("2027-12-31") }], added),
    ).toBeUndefined();
    expect(
      valuationClosedBy([{ ...open, propertyId: "q" }], added),
    ).toBeUndefined();
    expect(valuationClosedBy([], added)).toBeUndefined();
  });
});

describe("leaseClosedBy (ADR 0163)", () => {
  const open: Lease = {
    id: "l1",
    propertyId: "p",
    startDate: isoDate("2024-01-01"),
    monthlyRent: money(100),
  };
  const added: Lease = {
    id: "l2",
    propertyId: "p",
    startDate: isoDate("2026-03-01"),
    monthlyRent: money(200),
  };
  const closed = { ...open, endDate: isoDate("2026-02-28") };

  it("a new lease ends the open lease before it the day before", () =>
    expect(leaseClosedBy([open], added)).toEqual(closed));

  it("a dated one ends it too", () =>
    expect(
      leaseClosedBy([open], { ...added, endDate: isoDate("2026-12-31") }),
    ).toEqual(closed));

  it("nothing to close: the same start, one already ended, another property's", () => {
    expect(
      leaseClosedBy([open], { ...added, startDate: open.startDate }),
    ).toBeUndefined();
    expect(
      leaseClosedBy([{ ...open, endDate: isoDate("2027-12-31") }], added),
    ).toBeUndefined();
    expect(
      leaseClosedBy([{ ...open, propertyId: "q" }], added),
    ).toBeUndefined();
  });
});
