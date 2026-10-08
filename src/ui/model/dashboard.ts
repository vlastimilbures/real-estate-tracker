// Pure presentation model for the Dashboard's as-of tiles and monthly inflow / outflow
// band. Monthly = the tiles' annual ÷ 12. Net is the baseline (== netCashFlow ÷ 12).
import type { Decimal } from "../../lib/money";
import {
  cpiAt,
  edate,
  lastGridMonthOnOrBefore,
  portfolioSnapshotAtYear,
  propertySnapshotAtYear,
  realPortfolioSnapshot,
  realPropertySnapshot,
} from "../../engine";
import type {
  Assumptions,
  PortfolioSnapshot,
  PortfolioKPIs,
  ProjectionYear,
  Property,
  PropertySnapshot,
} from "../../engine";
import { fmtDate } from "../../lib/format";
import type { Mode } from "./lens";
import type { Dictionary } from "../../i18n";
import {
  periodLabelLocalized,
  projectionSeries,
  yearLabel,
  type SeriesRow,
} from "./projection";
import { at } from "../../lib/arrays";

export interface MonthlyFlow {
  inflow: Decimal; // effective rent / 12
  outflow: Decimal; // (holding costs + debt service) / 12
  net: Decimal; // baseline
}

export function monthlyFlow(s: PortfolioSnapshot): MonthlyFlow {
  const inflow = s.effectiveGrossIncome.div(12);
  const outflow = s.holdingCosts.plus(s.annualDebtService).div(12);
  return { inflow, outflow, net: inflow.minus(outflow) };
}

/** Net worth at the horizon under the chosen lens (engine already provides both). */
export function netWorthHorizon(kpis: PortfolioKPIs, mode: Mode): Decimal {
  return mode === "real" ? kpis.netWorthReal : kpis.netWorthNominal;
}

/** Projection year (0..horizon) closest to an as-of date, on the baseDate-anchored
 *  whole-year grid the projection/charts use. ≤ baseDate ⇒ 0 (the current snapshot).
 *  Months count on the D-21 month-end grid, as value growth and the CPI index count them,
 *  so 31 Aug → 28 Feb is six months (ADR 0150). */
export function projectionYearForAsOf(baseDate: Date, asOf: Date): number {
  const months = lastGridMonthOnOrBefore(baseDate, asOf);
  if (months <= 0) return 0;
  return Math.round(months / 12);
}

/**
 * What the as-of tiles show (ADR 0088): the projection year the date rounds to; else
 * today's effective-dated snapshot; else the records in force on the date (under six
 * months after the base date). The one as-of rule (ADR 0150): the tile mappers and every
 * label read this basis, so tiles and labels agree by construction. The date is resolved
 * into the window first (`resolveAsOf`), so it never rounds past the horizon.
 */
export type AsOfBasis =
  | { kind: "today" }
  | { kind: "projection"; year: number; calendarYear: number }
  | { kind: "snapshot"; date: Date };

/**
 * Snapshot used to render the dashboard KPI tiles + monthly-flow band. Today or on a
 * records-in-force date this is the effective-dated engine snapshot under the chosen
 * lens, deflated (real mode) by the engine price index from baseDate. In a projection
 * year it is that year of `series` — the SAME rows the charts plot — so the cards and the
 * "Net cash flow by year" chart agree by construction (rather than diverging because the
 * snapshot annualizes a point-in-time run-rate while the chart sums the projected year).
 * `series` is already lens-adjusted, so no further deflation is applied on that path.
 * `weightedAvgRate` and `perProperty` stay from the engine snapshot (the projection is
 * portfolio-level and carries no per-property / weighted-rate breakdown).
 */
export function tilesForAsOf(
  snapshot: PortfolioSnapshot,
  series: SeriesRow[],
  basis: AsOfBasis,
  mode: Mode,
  assumptions: Assumptions,
): PortfolioSnapshot {
  if (basis.kind === "projection")
    return portfolioSnapshotAtYear(snapshot, at(series, basis.year));
  return mode === "real"
    ? realPortfolioSnapshot(snapshot, cpiAt(assumptions, snapshot.asOf))
    : snapshot;
}

/**
 * Property-detail counterpart of `tilesForAsOf` (DR-054, D-62): the same as-of basis, so
 * the property tiles add up to the Dashboard. The property snapshot carries no `asOf`,
 * so the caller passes the date it was evaluated at. `owned` follows `ownedOn` under the
 * same basis, so a pending purchase reads the same on the tiles, the subtitle and the
 * Properties row (ADR 0156).
 */
export function propertyTilesForAsOf(
  snapshot: PropertySnapshot,
  series: SeriesRow[],
  basis: AsOfBasis,
  asOf: Date,
  mode: Mode,
  assumptions: Assumptions,
  purchaseDate: Date,
): PropertySnapshot {
  const tiles =
    basis.kind === "projection"
      ? propertySnapshotAtYear(snapshot, at(series, basis.year))
      : mode === "real"
        ? realPropertySnapshot(snapshot, cpiAt(assumptions, asOf))
        : snapshot;
  return {
    ...tiles,
    owned: ownedOn(purchaseDate, basis, assumptions.baseDate, asOf),
  };
}

/** The as-of basis of a resolved `asOf` (see `AsOfBasis`). */
export function asOfView(
  baseDate: Date,
  asOf: Date,
  series: SeriesRow[],
  isToday: boolean,
): AsOfBasis {
  const n = projectionYearForAsOf(baseDate, asOf);
  if (n > 0)
    return {
      kind: "projection",
      year: n,
      calendarYear: at(series, n).calendarYear,
    };
  if (isToday) return { kind: "today" };
  return { kind: "snapshot", date: asOf };
}

/**
 * Whether a property counts as owned under `basis` (ADR 0150): in a projection year, by
 * that year's end, the date its balances are read at (as the projection turns a purchase
 * on in the year that holds it); otherwise by the as-of date.
 */
export function ownedOn(
  purchaseDate: Date,
  basis: AsOfBasis,
  baseDate: Date,
  asOf: Date,
): boolean {
  const by =
    basis.kind === "projection" ? edate(baseDate, basis.year * 12) : asOf;
  return purchaseDate.getTime() <= by.getTime();
}

/**
 * The Properties rows (ADR 0150): each property's Property detail tiles at `asOf` under
 * `basis`, in nominal Kč (the page has no lens), so a row and its detail page show the same
 * figures for the same date. `projections` holds every listed property's projection.
 */
export function propertyRowsForAsOf(
  perProperty: PropertySnapshot[],
  properties: readonly Property[],
  projections: ReadonlyMap<string, ProjectionYear[]>,
  basis: AsOfBasis,
  asOf: Date,
  assumptions: Assumptions,
): PropertySnapshot[] {
  const purchase = new Map(properties.map((p) => [p.id, p.purchaseDate]));
  return perProperty.map((p) =>
    propertyTilesForAsOf(
      p,
      projectionSeries(
        projections.get(p.propertyId) ?? [],
        "nominal",
        assumptions,
      ),
      basis,
      asOf,
      "nominal",
      assumptions,
      // Every row comes from `properties`, so its purchase date is always there.
      purchase.get(p.propertyId) ?? asOf,
    ),
  );
}

/** Calendar year of the last projection row ("Net worth in 2056"); as-of independent. */
export function horizonEndYear(series: SeriesRow[]): number {
  return at(series, series.length - 1).calendarYear;
}

/** "Y5 · 2031" and "Jul 2030 – Jun 2031", as the Projections table labels that row. */
function yearAndPeriod(
  t: Dictionary,
  b: { year: number; calendarYear: number },
  baseDate: Date,
): [string, string] {
  return [
    yearLabel(t, b.year, b.calendarYear),
    periodLabelLocalized(baseDate, b.year, t.monthsShort, t.projGrid.opening),
  ];
}

/** Title + hint of the monthly cash-flow panel. */
export function monthlyFlowLabels(
  t: Dictionary,
  basis: AsOfBasis,
  baseDate: Date,
  asOf: Date,
): { title: string; hint: string } {
  const d = t.dashboard;
  if (basis.kind === "projection") {
    const [year, period] = yearAndPeriod(t, basis, baseDate);
    return {
      title: d.monthlyEquivalentYear(year, period),
      hint: d.monthlyHintProjection,
    };
  }
  return {
    title:
      basis.kind === "today"
        ? d.currentMonthlyCashFlow
        : d.monthlyCashFlowOn(fmtDate(basis.date)),
    hint: d.monthlyHint(fmtDate(asOf)),
  };
}

/** Foot of the annual net cash flow tile. */
export function netCashFlowFoot(t: Dictionary, basis: AsOfBasis): string {
  const d = t.dashboard;
  if (basis.kind === "today") return d.noiMinusDebtService;
  if (basis.kind === "snapshot")
    return d.noiMinusDebtServiceOn(fmtDate(basis.date));
  return d.noiMinusDebtServiceYear(
    yearLabel(t, basis.year, basis.calendarYear),
  );
}

/** As-of picker hint: how the date maps to what is shown; none at today. */
export function asOfHint(
  t: Dictionary,
  basis: AsOfBasis,
  baseDate: Date,
): string | null {
  const c = t.common;
  if (basis.kind === "today") return null;
  if (basis.kind === "projection")
    return c.asOfHintProjection(...yearAndPeriod(t, basis, baseDate));
  return c.asOfHintSnapshot(fmtDate(basis.date));
}

/**
 * Dashboard page subtitle: notes an active property filter and/or a non-today as-of
 * date; falls back to a plain default when neither applies.
 */
export function dashboardSubtitle(
  t: Dictionary,
  filterActive: boolean,
  effectiveCount: number,
  totalCount: number,
  isToday: boolean,
  asOf: Date,
): string {
  const parts: string[] = [];
  if (filterActive)
    parts.push(t.dashboard.subFilter(effectiveCount, totalCount));
  if (!isToday) parts.push(t.dashboard.asOf(fmtDate(asOf)));
  return parts.length ? parts.join(" · ") : t.dashboard.subtitleDefault;
}
