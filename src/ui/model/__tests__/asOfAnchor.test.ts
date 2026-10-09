// DR-054 / UX-053 (D-62): one as-of rule for the Dashboard and Property detail. A future
// as-of date reads the nearest projection year on both screens, so the property tiles add
// up to the Dashboard tiles; real terms deflate from baseDate with the engine CPI.
import { describe, it, expect } from "vitest";
import {
  cpiAt,
  edate,
  portfolioProjection,
  portfolioSnapshot,
  propertyProjection,
  propertySnapshot,
  EMPTY_PROPERTY_SCHEDULE,
  propertySchedules,
  schedulesByProperty,
  type IsoDate,
} from "../../../engine";
import { assumptions, portfolio } from "../../../engine/__tests__/support/seed";
import { ZERO, type Decimal } from "../../../lib/money";
import { projectionSeries } from "../projection";
import { asOfView, propertyTilesForAsOf, tilesForAsOf } from "../dashboard";
import type { Mode } from "../lens";

const ids = portfolio.properties.map((p) => p.id);
const schedules = schedulesByProperty(portfolio.mortgages, ids, assumptions);
const fullSchedules = propertySchedules(portfolio.mortgages, ids, assumptions);

function tiles(asOf: IsoDate, mode: Mode) {
  const snap = portfolioSnapshot(portfolio, assumptions, asOf, schedules);
  const series = projectionSeries(
    portfolioProjection(portfolio, assumptions),
    mode,
    assumptions,
  );
  const basis = asOfView(assumptions.baseDate, asOf, series, false);
  const dashboard = tilesForAsOf(snap, series, basis, mode, assumptions);
  const perProperty = portfolio.properties.map((p) => {
    const schedule = schedules.get(p.id) ?? [];
    const full = fullSchedules.get(p.id) ?? EMPTY_PROPERTY_SCHEDULE;
    return propertyTilesForAsOf(
      propertySnapshot(p, portfolio, assumptions, asOf, schedule),
      projectionSeries(
        propertyProjection(p, portfolio, assumptions, full),
        mode,
        assumptions,
      ),
      basis,
      asOf,
      mode,
      assumptions,
      p.purchaseDate,
    );
  });
  return { dashboard, perProperty };
}

const sum = (xs: Decimal[]) => xs.reduce((a, b) => a.plus(b), ZERO);
const close = (a: Decimal, b: Decimal) =>
  expect(a.minus(b).abs().toNumber()).toBeLessThan(1e-6);

describe("one as-of rule on both screens (UX-053)", () => {
  const future = edate(assumptions.baseDate, 61); // ⇒ projection year 5

  for (const mode of ["nominal", "real"] as const) {
    it(`future as-of, ${mode}: property tiles add up to the Dashboard tiles`, () => {
      const { dashboard, perProperty } = tiles(future, mode);
      close(sum(perProperty.map((s) => s.value)), dashboard.totalValue);
      close(sum(perProperty.map((s) => s.debt)), dashboard.totalDebt);
      close(sum(perProperty.map((s) => s.noi)), dashboard.noi);
      close(
        sum(perProperty.map((s) => s.annualDebtService)),
        dashboard.annualDebtService,
      );
      close(sum(perProperty.map((s) => s.netCashFlow)), dashboard.netCashFlow);
    });
  }

  it("future as-of: a property tile is its projection row for that year", () => {
    const p = portfolio.properties[1];
    const full = fullSchedules.get(p.id) ?? EMPTY_PROPERTY_SCHEDULE;
    const row = propertyProjection(p, portfolio, assumptions, full)[5];
    const s = tiles(future, "nominal").perProperty[1];
    expect(s.debt.toString()).toBe(row.balance.toString());
    expect(s.netCashFlow.toString()).toBe(row.netCashFlow.toString());
    expect(s.dscr?.toString()).toBe(row.dscr?.toString());
  });

  it("as-of inside year 0: the effective-dated snapshot, deflated from baseDate", () => {
    const asOf = edate(assumptions.baseDate, 4); // 4 months after the projection start
    const p = portfolio.properties[0];
    const schedule = schedules.get(p.id) ?? [];
    const snap = propertySnapshot(p, portfolio, assumptions, asOf, schedule);
    const nominal = tiles(asOf, "nominal").perProperty[0];
    const real = tiles(asOf, "real").perProperty[0];
    expect(nominal.value.toString()).toBe(snap.value.toString());
    expect(real.value.toString()).toBe(
      snap.value.div(cpiAt(assumptions, asOf)).toString(),
    );
    expect(snap.ltv).not.toBeNull();
    expect(real.ltv?.toString()).toBe(snap.ltv?.toString());
  });

  it("at baseDate real equals nominal (price base = projection start)", () => {
    const { perProperty } = tiles(assumptions.baseDate, "real");
    const nominal = tiles(assumptions.baseDate, "nominal").perProperty;
    expect(perProperty[2].equity.toString()).toBe(nominal[2].equity.toString());
  });
});
