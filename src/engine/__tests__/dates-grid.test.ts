// Units for the single "first grid month" scan and addYears (P4a, DR-044 / DR-072).
import { describe, it, expect } from "vitest";
import {
  addYears,
  edate,
  firstAfter,
  firstGridMonthOnOrAfter,
  inForceOrUpcoming,
  isoDate,
  lastGridMonthOnOrBefore,
  lastOnOrBefore,
} from "../dates";

const base = isoDate("2026-06-07");

describe("firstGridMonthOnOrAfter", () => {
  it("returns 1 when the date is on or before the anchor", () => {
    expect(firstGridMonthOnOrAfter(base, base)).toBe(1);
    expect(firstGridMonthOnOrAfter(base, isoDate("2020-01-01"))).toBe(1);
  });

  it("finds the first grid point on or after the date", () => {
    expect(firstGridMonthOnOrAfter(base, isoDate("2026-06-08"))).toBe(1);
    expect(firstGridMonthOnOrAfter(base, isoDate("2026-07-07"))).toBe(1);
    expect(firstGridMonthOnOrAfter(base, isoDate("2026-07-08"))).toBe(2);
    expect(firstGridMonthOnOrAfter(base, isoDate("2028-03-15"))).toBe(22);
  });

  it("follows EDATE month-end clamping on the grid", () => {
    const jan31 = isoDate("2024-01-31");
    // Grid: Feb 29, Mar 31, Apr 30 …
    expect(firstGridMonthOnOrAfter(jan31, isoDate("2024-02-29"))).toBe(1);
    expect(firstGridMonthOnOrAfter(jan31, isoDate("2024-03-01"))).toBe(2);
    expect(firstGridMonthOnOrAfter(jan31, isoDate("2024-04-30"))).toBe(3);
  });

  it("returns limit + 1 when nothing is found within the limit", () => {
    expect(firstGridMonthOnOrAfter(base, isoDate("2030-01-01"), 12)).toBe(13);
    expect(firstGridMonthOnOrAfter(base, isoDate("2030-01-01"), 0)).toBe(1);
  });

  it("agrees with a brute-force EDATE scan", () => {
    for (let d = 0; d < 800; d += 7) {
      const date = new Date(base.getTime() + d * 86_400_000);
      let m = 1;
      while (edate(base, m).getTime() < date.getTime()) m++;
      expect(firstGridMonthOnOrAfter(base, date)).toBe(m);
    }
  });
});

describe("lastGridMonthOnOrBefore (payments due by a date — D-21, DR-070)", () => {
  it("counts the grid points EDATE(anchor, k) ≤ date, k ≥ 1", () => {
    expect(lastGridMonthOnOrBefore(base, base)).toBe(0);
    expect(lastGridMonthOnOrBefore(base, isoDate("2026-07-06"))).toBe(0);
    expect(lastGridMonthOnOrBefore(base, isoDate("2026-07-07"))).toBe(1);
    // Seed Javorova: start 2021-01-17, baseDate 2026-06-07 → 64 payments.
    expect(
      lastGridMonthOnOrBefore(isoDate("2021-01-17"), isoDate("2026-06-07")),
    ).toBe(64);
  });

  it("is 0 for a date before the anchor", () => {
    expect(lastGridMonthOnOrBefore(base, isoDate("2020-01-01"))).toBe(0);
  });

  it("counts a clamped month-end due date as due (DR-070)", () => {
    // 31 Jan → due 28 Feb: one payment made by 28 Feb (monthsBetween says 0).
    expect(
      lastGridMonthOnOrBefore(isoDate("2021-01-31"), isoDate("2021-02-28")),
    ).toBe(1);
    expect(
      lastGridMonthOnOrBefore(isoDate("2021-01-31"), isoDate("2026-02-28")),
    ).toBe(61);
    // 29 Feb 2024 → due 28 Feb 2025 is payment 12.
    expect(
      lastGridMonthOnOrBefore(isoDate("2024-02-29"), isoDate("2025-02-28")),
    ).toBe(12);
  });

  it("agrees with a brute-force EDATE scan", () => {
    for (const a of ["2024-01-31", "2024-02-29", "2026-06-07", "2023-08-30"]) {
      const anchor = isoDate(a);
      for (let d = -40; d < 900; d += 3) {
        const date = new Date(anchor.getTime() + d * 86_400_000);
        let k = 0;
        while (edate(anchor, k + 1).getTime() <= date.getTime()) k++;
        expect(lastGridMonthOnOrBefore(anchor, date)).toBe(k);
      }
    }
  });
});

describe("addYears", () => {
  it("is EDATE by 12·n (Feb 29 clamps to Feb 28)", () => {
    expect(addYears(isoDate("2024-02-29"), 1)).toEqual(isoDate("2025-02-28"));
    expect(addYears(isoDate("2024-02-29"), 4)).toEqual(isoDate("2028-02-29"));
    expect(addYears(base, 30)).toEqual(isoDate("2056-06-07"));
  });
});

describe("effective-dating tie-break (DR-071)", () => {
  const rows = [
    { id: "a", start: isoDate("2026-01-01") },
    { id: "b", start: isoDate("2026-01-01") },
  ];
  it("lastOnOrBefore picks the last of equal starts, firstAfter the first", () => {
    expect(lastOnOrBefore(rows, base, (r) => r.start)?.id).toBe("b");
    expect(firstAfter(rows, isoDate("2025-01-01"), (r) => r.start)?.id).toBe(
      "a",
    );
  });
});

describe("inForceOrUpcoming", () => {
  const rows = [
    { id: "old", start: isoDate("2025-01-01"), end: isoDate("2025-12-31") },
    { id: "next", start: isoDate("2027-01-01"), end: undefined },
    { id: "later", start: isoDate("2028-01-01"), end: undefined },
  ];
  const get = (asOf: string) =>
    inForceOrUpcoming(
      rows,
      isoDate(asOf),
      (r) => r.start,
      (r) => r.end,
    )?.id;
  it("prefers the record in force, else the nearest upcoming", () => {
    expect(get("2025-06-01")).toBe("old");
    expect(get("2026-06-07")).toBe("next"); // gap after an ended record
    expect(get("2024-01-01")).toBe("old");
    expect(get("2029-01-01")).toBe("later");
  });
  it("is undefined for no records", () =>
    expect(
      inForceOrUpcoming([], isoDate("2026-01-01"), () => isoDate("2026-01-01")),
    ).toBeUndefined());
});
