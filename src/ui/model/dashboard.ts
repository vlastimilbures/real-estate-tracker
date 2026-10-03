// Pure presentation model for the Dashboard's "current monthly inflow / outflow" band.
// Monthly = current-snapshot annual ÷ 12. Net is the baseline (== netCashFlow ÷ 12).
import type { Decimal } from "../../lib/money";
import {
  cpiAt,
  monthsBetween,
  portfolioSnapshotAtYear,
  propertySnapshotAtYear,
  realPortfolioSnapshot,
  realPropertySnapshot,
} from "../../engine";
import type {
  Assumptions,
  PortfolioSnapshot,
  PortfolioKPIs,
  PropertySnapshot,
} from "../../engine";
import { fmtDate } from "../../lib/format";
import type { Mode } from "./lens";
import type { Dictionary } from "../../i18n";
import type { SeriesRow } from "./projection";
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
 *  whole-year grid the projection/charts use. ≤ baseDate ⇒ 0 (the current snapshot). */
export function projectionYearForAsOf(baseDate: Date, asOf: Date): number {
  const months = monthsBetween(baseDate, asOf);
  if (months <= 0) return 0;
  return Math.round(months / 12);
}

/**
 * Snapshot used to render the dashboard KPI tiles + monthly-flow band. For the current
 * snapshot (as-of ≤ baseDate, year 0) this is the effective-dated engine snapshot under
 * the chosen lens. For a FUTURE as-of date it is sourced from the projection year that
 * the as-of date lands on — the SAME `series` the charts plot — so the cards and the
 * "Net cash flow by year" chart agree by construction (rather than diverging because the
 * snapshot annualizes a point-in-time run-rate while the chart sums the projected year).
 * `series` is already lens-adjusted, so no further deflation is applied on that path.
 * `weightedAvgRate` and `perProperty` stay from the engine snapshot (the projection is
 * portfolio-level and carries no per-property / weighted-rate breakdown).
 */
export function tilesForAsOf(
  snapshot: PortfolioSnapshot,
  series: SeriesRow[],
  mode: Mode,
  assumptions: Assumptions,
): PortfolioSnapshot {
  const n = projectionYearForAsOf(assumptions.baseDate, snapshot.asOf);
  if (n <= 0 || n >= series.length) {
    // Today / past, or beyond the projected horizon: keep the effective-dated snapshot,
    // deflated (real mode) by the engine price index from baseDate.
    return mode === "real"
      ? realPortfolioSnapshot(snapshot, cpiAt(assumptions, snapshot.asOf))
      : snapshot;
  }
  return portfolioSnapshotAtYear(snapshot, at(series, n));
}

/**
 * Property-detail counterpart of `tilesForAsOf` (DR-054, D-62): the same as-of rule, so
 * the property tiles add up to the Dashboard. The property snapshot carries no `asOf`,
 * so the caller passes the date it was evaluated at.
 */
export function propertyTilesForAsOf(
  snapshot: PropertySnapshot,
  series: SeriesRow[],
  asOf: Date,
  mode: Mode,
  assumptions: Assumptions,
): PropertySnapshot {
  const n = projectionYearForAsOf(assumptions.baseDate, asOf);
  if (n <= 0 || n >= series.length) {
    return mode === "real"
      ? realPropertySnapshot(snapshot, cpiAt(assumptions, asOf))
      : snapshot;
  }
  return propertySnapshotAtYear(snapshot, at(series, n));
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
