// Chart boundary: Decimal series → plain-number rows. The conversion must be exact
// (toNumber of each Decimal), preserve length and calendar years, and carry only the
// plotted fields. Driven off the real engine fixtures via the projection lens.
import { describe, it, expect } from "vitest";
import { portfolio, assumptions } from "../../../engine/__tests__/support/seed";
import { portfolioProjection } from "../../../engine";
import { projectionSeries } from "../projection";
import {
  tableValue,
  tableYear,
  tipValue,
  toChartRows,
  tooltipTotal,
} from "../chartData";
import { getDict } from "../../../i18n";
import { toNumber } from "../../../lib/money";

const series = projectionSeries(
  portfolioProjection(portfolio, assumptions),
  "nominal",
  assumptions,
);

describe("toChartRows", () => {
  it("preserves length and calendar years", () => {
    const rows = toChartRows(series);
    expect(rows.length).toBe(series.length);
    expect(rows.map((r) => r.calendarYear)).toEqual(
      series.map((s) => s.calendarYear),
    );
  });

  it("converts each Decimal field to the exact toNumber() value", () => {
    const rows = toChartRows(series);
    const i = 10; // an arbitrary mid-horizon row
    expect(rows[i].value).toBe(toNumber(series[i].value));
    expect(rows[i].balance).toBe(toNumber(series[i].balance));
    expect(rows[i].equity).toBe(toNumber(series[i].equity));
    expect(rows[i].ltv).toBe(toNumber(series[i].ltv!));
    expect(rows[i].grossRent).toBe(toNumber(series[i].grossRent));
    expect(rows[i].effectiveRent).toBe(toNumber(series[i].effectiveRent));
    expect(rows[i].noi).toBe(toNumber(series[i].noi));
    expect(rows[i].debtService).toBe(toNumber(series[i].debtService));
    expect(rows[i].netCashFlow).toBe(toNumber(series[i].netCashFlow));
  });

  it("yields plain numbers for every field", () => {
    const r = toChartRows(series)[5];
    for (const v of Object.values(r)) {
      expect(typeof v).toBe("number");
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it("leaves year-0 flows unplotted (null) and keeps the opening stocks (UX-033)", () => {
    const r0 = toChartRows(series)[0];
    expect(r0.grossRent).toBeNull();
    expect(r0.effectiveRent).toBeNull();
    expect(r0.noi).toBeNull();
    expect(r0.debtService).toBeNull();
    expect(r0.netCashFlow).toBeNull();
    expect(r0.value).toBe(toNumber(series[0].value));
    expect(r0.balance).toBe(toNumber(series[0].balance));
    expect(r0.equity).toBe(toNumber(series[0].equity));
    expect(r0.ltv).toBe(toNumber(series[0].ltv!));
  });

  it("returns an empty array for empty input", () => {
    expect(toChartRows([])).toEqual([]);
  });
});

describe("tipValue", () => {
  it("keeps a gap (null) as null and converts plotted values to numbers", () => {
    expect(tipValue(null)).toBeNull();
    expect(tipValue(undefined)).toBeNull();
    expect(tipValue(-1250.5)).toBe(-1250.5);
    expect(tipValue("42")).toBe(42);
  });
});

describe("tooltipTotal", () => {
  it("sums the hovered values (0 when none)", () => {
    expect(tooltipTotal([1200, -300.5, 0])).toBe(899.5);
    expect(tooltipTotal([])).toBe(0);
  });
});

// UX-075 (DR-144): chart-table cells.
describe("tableValue / tableYear", () => {
  it("keeps plotted numbers and turns gaps into null", () => {
    expect(tableValue(-12.5)).toBe(-12.5);
    expect(tableValue(0)).toBe(0);
    for (const v of [null, undefined, Number.NaN, Infinity, "3"])
      expect(tableValue(v)).toBeNull();
  });

  it("labels a row by projection year, else by calendar year", () => {
    const t = getDict("en");
    expect(tableYear(t, { year: 5, calendarYear: 2031 })).toBe("Y5 · 2031");
    expect(tableYear(t, { calendarYear: 2031 })).toBe("2031");
    expect(tableYear(t, {})).toBe("");
  });
});
