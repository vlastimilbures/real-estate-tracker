// The dashboard KPI tiles must agree with the per-year charts: for a future as-of date
// the tiles are sourced from the projection year that date lands on (the same `series`
// the charts plot), not from a point-in-time annualized snapshot.
import { describe, it, expect } from "vitest";
import {
  projectionYearForAsOf,
  tilesForAsOf,
  dashboardSubtitle,
} from "../dashboard";
import type { SeriesRow } from "../projection";
import { D, ZERO, toNumber } from "../../../lib/money";
import { edate, isoDate } from "../../../engine";
import type { PortfolioSnapshot, IsoDate } from "../../../engine";
import { en } from "../../../i18n/en";
import { assumptions } from "../../../engine/__tests__/support/seed";
import { rate } from "../../../engine";

const baseDate = isoDate("2026-06-07");
// Only baseDate and the inflation inputs reach tilesForAsOf (the CPI index).
const tileAssumptions = {
  ...assumptions,
  baseDate,
  inflationPa: rate("0.025"),
};

function seriesRow(year: number, netCashFlow: string): SeriesRow {
  return {
    year,
    calendarYear: 2026 + year,
    value: D("30000000"),
    balance: D("10000000"),
    equity: D("20000000"),
    ltv: D("0.33"),
    grossRent: D("1000000"),
    effectiveRent: D("950000"),
    holdingCosts: D("250000"),
    noi: D("700000"),
    interest: ZERO,
    principal: D("100000"),
    debtService: D("760000"),
    netCashFlow: D(netCashFlow),
    dscr: D("0.9"),
    draws: ZERO,
    prepaid: ZERO,
  };
}

// Distinct net cash flow per year so a wrong year index would be caught.
const series = Array.from({ length: 6 }, (_, y) =>
  seriesRow(y, String(100000 + y * 10000)),
);

function snapshotAt(asOf: Date): PortfolioSnapshot {
  return {
    asOf: asOf as IsoDate,
    perProperty: [],
    totalValue: D("28730000"),
    totalDebt: D("9515405.13"),
    totalEquity: D("19214594.87"),
    ltv: D("0.3312"),
    grossAnnualRent: D("846600"),
    effectiveGrossIncome: D("804270"),
    holdingCosts: D("215220"),
    noi: D("589050"),
    annualDebtService: D("646384.2"),
    netCashFlow: D("-57334.2"),
    grossYield: D("0.02947"),
    netYield: D("0.0205"),
    dscr: D("0.9113"),
    weightedAvgRate: D("0.035226"),
  };
}

describe("projectionYearForAsOf", () => {
  it("maps baseDate (and earlier) to year 0", () => {
    expect(projectionYearForAsOf(baseDate, baseDate)).toBe(0);
    expect(projectionYearForAsOf(baseDate, isoDate("2020-01-01"))).toBe(0);
  });
  it("maps baseDate + N years to year N, tolerating a few days of drift", () => {
    expect(projectionYearForAsOf(baseDate, edate(baseDate, 60))).toBe(5);
    expect(projectionYearForAsOf(baseDate, isoDate("2031-06-26"))).toBe(5); // +19 days
  });
});

describe("tilesForAsOf", () => {
  it("at year 0 (current) keeps the effective-dated snapshot", () => {
    const s = tilesForAsOf(
      snapshotAt(baseDate),
      series,
      "nominal",
      tileAssumptions,
    );
    expect(toNumber(s.netCashFlow)).toBeCloseTo(-57334.2, 6);
  });

  it("at a future as-of date sources tiles from the matching projection year (== chart)", () => {
    const s = tilesForAsOf(
      snapshotAt(edate(baseDate, 60)),
      series,
      "nominal",
      tileAssumptions,
    );
    // Card == the chart's year-5 value, not the annualized snapshot run-rate.
    expect(toNumber(s.netCashFlow)).toBeCloseTo(
      toNumber(series[5].netCashFlow),
      6,
    );
    expect(toNumber(s.totalEquity)).toBeCloseTo(toNumber(series[5].equity), 6);
    expect(toNumber(s.annualDebtService)).toBeCloseTo(
      toNumber(series[5].debtService),
      6,
    );
  });
});

describe("dashboardSubtitle", () => {
  const today = isoDate("2026-06-07");

  it("falls back to the default when no filter and as-of is today", () => {
    expect(dashboardSubtitle(en, false, 3, 3, true, today)).toBe(
      en.dashboard.subtitleDefault,
    );
  });

  it("notes an active property filter", () => {
    expect(dashboardSubtitle(en, true, 2, 3, true, today)).toBe(
      en.dashboard.subFilter(2, 3),
    );
  });

  it("notes a non-today as-of date", () => {
    const asOf = isoDate("2027-01-01");
    expect(dashboardSubtitle(en, false, 3, 3, false, asOf)).toBe(
      en.dashboard.asOf("01.01.2027"),
    );
  });

  it("joins both filter and as-of notes when both apply", () => {
    const asOf = isoDate("2027-01-01");
    expect(dashboardSubtitle(en, true, 2, 3, false, asOf)).toBe(
      `${en.dashboard.subFilter(2, 3)} · ${en.dashboard.asOf("01.01.2027")}`,
    );
  });
});
