// Regression for the late-let future property: a unit bought in the future whose
// lease (and therefore rent) only starts *years after* the purchase. The engine must
// keep the rent at zero until the lease's effective date and turn it on then — not
// project zero forever (the single-snapshot rent0 bug) and not start it at purchase.
import { describe, it, expect } from "vitest";
import { propertyProjection } from "../projections";
import { EMPTY_PROPERTY_SCHEDULE, propertySchedules } from "../schedule";
import { isoDate } from "../dates";
import { assumptions, portfolio } from "./support/seed";
import { mixed } from "./support/mixed";
import type { Portfolio, Property } from "../types";
import { rate } from "../brands";
import { money } from "../brands";

const PURCHASE = isoDate("2026-09-01"); // ~3 months after baseDate 2026-06-07
const RENT_START = isoDate("2029-06-01"); // unit finished/let only later, mid-bucket
const RENT_START_YEAR = 2029;
const VALUE = 6_000_000;
const MONTHLY_RENT = 24_000;
// baseDate 2026-06-07 ⇒ buckets are fiscal years ending in their label. RENT_START
// 2029-06-01 lands in grid month 36 = projection year 3 (calendarYear 2029, months
// 25–36), as that bucket's LAST month ⇒ only 1 month of rent in the 2029 row; the
// 2030 row is the first full 12. This is the partial-first-year pro-rating.
const FIRST_YEAR_MONTHS = 1;

const slovanske: Property = {
  id: "slovanske",
  name: "Byt Slovanske",
  purchaseDate: PURCHASE,
  purchasePrice: money("5800000"),
};

const withFuture: Portfolio = {
  properties: [...portfolio.properties, slovanske],
  mortgages: [
    ...portfolio.mortgages,
    {
      id: "m-slovanske",
      propertyId: "slovanske",
      startDate: PURCHASE,
      initialPrincipal: money("4000000"),
      fixationYears: 5,
      interestRatePa: rate("0.045"),
      monthlyInstalment: money("20266"), // ≈ 30-yr amortizing instalment
      loanTermYears: 30,
    },
  ],
  valuations: [
    ...portfolio.valuations,
    {
      id: "v-slovanske",
      propertyId: "slovanske",
      validFrom: PURCHASE,
      marketValue: money(VALUE),
    },
  ],
  leases: [
    ...portfolio.leases,
    {
      id: "l-slovanske",
      propertyId: "slovanske",
      startDate: RENT_START,
      monthlyRent: money(MONTHLY_RENT),
    },
  ],
  holdingCosts: portfolio.holdingCosts,
};

const schedules = propertySchedules(
  withFuture.mortgages,
  withFuture.properties.map((p) => p.id),
  assumptions,
);
const proj = propertyProjection(
  slovanske,
  withFuture,
  assumptions,
  schedules.get("slovanske") ?? EMPTY_PROPERTY_SCHEDULE,
);

describe("future property — rent gates to the lease effective date", () => {
  it("is owned (value + debt) before the rent starts, but carries zero rent", () => {
    const gap = proj.filter(
      (y) => y.value.greaterThan(0) && y.calendarYear < RENT_START_YEAR,
    );
    expect(gap.length).toBeGreaterThan(0); // 2027, 2028 are owned-but-unlet
    for (const y of gap) {
      expect(y.grossRent.isZero(), `grossRent @ ${y.calendarYear}`).toBe(true);
      expect(
        y.effectiveRent.isZero(),
        `effectiveRent @ ${y.calendarYear}`,
      ).toBe(true);
      expect(y.balance.greaterThan(0), `balance @ ${y.calendarYear}`).toBe(
        true,
      );
      // fixed holding costs still accrue while unlet ⇒ negative cash flow
      expect(y.netCashFlow.isNegative(), `netCF @ ${y.calendarYear}`).toBe(
        true,
      );
    }
  });

  it("pro-rates the partial turn-on year (1 month), then bills a full 12", () => {
    const first = proj.find((r) => r.calendarYear === RENT_START_YEAR)!;
    const firstFull = proj.find((r) => r.calendarYear === RENT_START_YEAR + 1)!;
    // turn-on bucket: only FIRST_YEAR_MONTHS of rent, NOT 12×
    expect(first.grossRent.toNumber()).toBeCloseTo(
      MONTHLY_RENT * FIRST_YEAR_MONTHS,
      2,
    );
    // next bucket is the first full year (12 months), indexed one step off the anchor
    expect(firstFull.grossRent.toNumber()).toBeCloseTo(
      MONTHLY_RENT * 1.03 * 12,
      0,
    );
    expect(firstFull.effectiveRent.toNumber()).toBeCloseTo(
      MONTHLY_RENT * 1.03 * 12 * (1 - 0.05),
      0,
    );
  });

  it("pro-rates fixed holding costs by months owned in the turn-on year", () => {
    // Purchase 2026-09-01 → grid month 3 → projection year 1 (2027), owned 10/12 months.
    // Rent is zero until 2029, so holding costs here are the fixed portion only.
    // Defaults (no override): tax 2550 + insurance 2550 + svj 1700×12 = 25,500 /yr at
    // base-date prices, inflated from the base date (SPEC §4.5, ADR 0165): CPI_t.
    const FIXED_YR = 25_500;
    const y2027 = proj.find((r) => r.calendarYear === 2027)!; // owned 10 months, CPI_1
    const y2028 = proj.find((r) => r.calendarYear === 2028)!; // owned 12 months, CPI_2
    expect(y2027.grossRent.isZero()).toBe(true);
    expect(y2027.holdingCosts.toNumber()).toBeCloseTo(
      (FIXED_YR * 1.025 * 10) / 12,
      2,
    );
    expect(y2028.holdingCosts.toNumber()).toBeCloseTo(FIXED_YR * 1.025 ** 2, 2);
  });

  it("inflates a later turn-on year's fixed costs from the base date, not from the purchase (ADR 0165)", () => {
    // mixed "Future buy": purchase 15.03.2028 → grid month 22 → projection year 2,
    // owned 3 of its 12 months. The fixed part is the default 25,500 × CPI_2 × 3/12.
    const schedules = propertySchedules(
      mixed.mortgages,
      mixed.properties.map((p) => p.id),
      assumptions,
    );
    const future = mixed.properties.find((p) => p.id === "future")!;
    const rows = propertyProjection(
      future,
      mixed,
      assumptions,
      schedules.get("future") ?? EMPTY_PROPERTY_SCHEDULE,
    );
    const VAR_PCT = 0.15 + 0.05;
    const fixedPart = (t: number) =>
      rows[t].holdingCosts.minus(rows[t].grossRent.times(VAR_PCT)).toNumber();
    expect(fixedPart(1)).toBe(0);
    expect(fixedPart(2)).toBeCloseTo((25_500 * 1.025 ** 2 * 3) / 12, 6);
    expect(fixedPart(3)).toBeCloseTo(25_500 * 1.025 ** 3, 6);
  });

  it("indexes rent annually between full years", () => {
    const full1 = proj.find((r) => r.calendarYear === RENT_START_YEAR + 1)!;
    const full2 = proj.find((r) => r.calendarYear === RENT_START_YEAR + 2)!;
    expect(full2.grossRent.toNumber()).toBeCloseTo(
      full1.grossRent.toNumber() * 1.03,
      1,
    );
  });
});
