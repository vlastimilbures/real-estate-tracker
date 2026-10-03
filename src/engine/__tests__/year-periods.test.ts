// D-22: projection years carry their period dates, and the calendar-year KPIs come with
// their projection year, so the UI can label "Y5 · 2031" (P6/P7). Additive: no number
// changes (the golden master proves it).
import { describe, it, expect } from "vitest";
import { isoDate } from "../dates";
import { portfolioProjection, propertyProjection } from "../projections";
import { portfolioKpis } from "../kpis";
import { schedulesByProperty } from "../schedule";
import type { Assumptions, ProjectionYear } from "../types";
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
