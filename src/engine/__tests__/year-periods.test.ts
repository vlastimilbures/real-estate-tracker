// D-22: projection years carry their period dates, and the calendar-year KPIs come with
// their projection year, so the UI can label "Y5 · 2031" (P6/P7). Additive: no number
// changes (the golden master proves it).
import { describe, it, expect } from "vitest";
import { money, rate } from "../brands";
import { isoDate } from "../dates";
import { portfolioProjection, propertyProjection } from "../projections";
import { portfolioKpis } from "../kpis";
import { schedulesByProperty } from "../schedule";
import type {
  Assumptions,
  MortgageBlock,
  Portfolio,
  PortfolioKPIs,
  ProjectionYear,
} from "../types";
import { assumptions, portfolio } from "./support/seed";
import { mixed } from "./support/mixed";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const periods = (p: ProjectionYear[]) =>
  p.map((y) => [y.year, iso(y.periodStart), iso(y.periodEnd)]);

describe("projection year periods (D-22)", () => {
  const proj = portfolioProjection(portfolio, assumptions);

  it("year 0 is baseDate itself; year t is (baseDate + t−1 years, baseDate + t years]", () => {
    expect(periods(proj).slice(0, 3)).toEqual([
      [0, "2026-06-07", "2026-06-07"],
      [1, "2026-06-07", "2027-06-07"],
      [2, "2027-06-07", "2028-06-07"],
    ]);
    expect(periods(proj).at(-1)).toEqual([30, "2055-06-07", "2056-06-07"]);
  });

  it("follows the month-end grid clamp (D-21) for a month-end baseDate", () => {
    const a: Assumptions = { ...assumptions, baseDate: isoDate("2024-02-29") };
    expect(periods(portfolioProjection(portfolio, a)).slice(0, 3)).toEqual([
      [0, "2024-02-29", "2024-02-29"],
      [1, "2024-02-29", "2025-02-28"],
      [2, "2025-02-28", "2026-02-28"],
    ]);
  });

  it("every property row has the portfolio row's period, owned or not", () => {
    const schedules = schedulesByProperty(
      mixed.mortgages,
      mixed.properties.map((p) => p.id),
      assumptions,
    );
    const total = periods(portfolioProjection(mixed, assumptions));
    for (const p of mixed.properties) {
      const rows = propertyProjection(
        p,
        mixed,
        assumptions,
        schedules.get(p.id) ?? [],
      );
      expect(periods(rows)).toEqual(total);
    }
  });
});

describe("KPI projection years (D-22)", () => {
  it("seed: first positive cash flow in Y5 (2031), debt-free in Y26 (2052)", () => {
    const k = portfolioKpis(portfolio, assumptions);
    expect(k.firstCashFlowPositiveYear).toBe(2031);
    expect(k.firstCashFlowPositiveProjectionYear).toBe(5);
    expect(k.debtFreeYear).toBe(2052);
    expect(k.debtFreeProjectionYear).toBe(26);
  });

  it("null together with the calendar year", () => {
    const k = portfolioKpis(portfolio, { ...assumptions, horizonYears: 3 });
    expect(k.firstCashFlowPositiveYear).toBeNull();
    expect(k.firstCashFlowPositiveProjectionYear).toBeNull();
    expect(k.debtFreeYear).toBeNull();
    expect(k.debtFreeProjectionYear).toBeNull();
  });
});

describe("ADR 0121: the first cash-flow-positive year is strictly positive", () => {
  /** One property bought after baseDate, let from its purchase date, no other income:
   *  every projection year before the purchase nets exactly 0. */
  const futureBuy = (
    purchaseDate: string,
    monthlyRent: string,
    loan?: MortgageBlock,
  ): Portfolio => ({
    properties: [
      {
        id: "f",
        name: "Future flat",
        type: "1 bedroom",
        sizeM2: 50,
        purchaseDate: isoDate(purchaseDate),
        purchasePrice: money("5000000"),
      },
    ],
    mortgages: loan ? [loan] : [],
    valuations: [],
    leases: [
      {
        id: "l-f",
        propertyId: "f",
        startDate: isoDate(purchaseDate),
        monthlyRent: money(monthlyRent),
      },
    ],
    holdingCosts: [],
  });

  /** The KPI year nets > 0 and no earlier year does (none at all when null). */
  function expectFirstStrictlyPositive(k: PortfolioKPIs, p: ProjectionYear[]) {
    const first = k.firstCashFlowPositiveProjectionYear;
    for (const y of p.slice(1)) {
      if (first === null || y.year < first) {
        expect(y.netCashFlow.greaterThan(0)).toBe(false);
      }
    }
    if (first !== null) {
      expect(p[first]?.netCashFlow.greaterThan(0)).toBe(true);
      expect(k.firstCashFlowPositiveYear).toBe(p[first]?.calendarYear);
    }
  }

  it("a planned cash purchase: the zero years before it do not count", () => {
    const pf = futureBuy("2030-06-01", "25000");
    const proj = portfolioProjection(pf, assumptions);
    expect(proj.slice(1, 4).map((y) => y.netCashFlow.isZero())).toEqual([
      true,
      true,
      true,
    ]);
    const k = portfolioKpis(pf, assumptions);
    expect(k.firstCashFlowPositiveYear).toBe(2030);
    expect(k.firstCashFlowPositiveProjectionYear).toBe(4);
    expectFirstStrictlyPositive(k, proj);
  });

  it("a planned purchase on a loan: the zero years before it do not count", () => {
    const pf = futureBuy("2029-01-01", "20000", {
      id: "m-f",
      propertyId: "f",
      startDate: isoDate("2029-01-01"),
      initialPrincipal: money("2000000"),
      fixationYears: 5,
      interestRatePa: rate("0.049"),
      monthlyInstalment: money("10614.53"),
    });
    const proj = portfolioProjection(pf, assumptions);
    expect(proj.slice(1, 3).map((y) => y.netCashFlow.isZero())).toEqual([
      true,
      true,
    ]);
    const k = portfolioKpis(pf, assumptions);
    // The purchase year (Y3, 2029) nets > 0; before the fix the KPI said Y1 (2027).
    expect(k.firstCashFlowPositiveYear).toBe(2029);
    expect(k.firstCashFlowPositiveProjectionYear).toBe(3);
    expectFirstStrictlyPositive(k, proj);
  });

  it("an empty portfolio has no positive year", () => {
    const empty: Portfolio = {
      properties: [],
      mortgages: [],
      valuations: [],
      leases: [],
      holdingCosts: [],
    };
    const k = portfolioKpis(empty, assumptions);
    expect(k.firstCashFlowPositiveYear).toBeNull();
    expect(k.firstCashFlowPositiveProjectionYear).toBeNull();
  });
});
