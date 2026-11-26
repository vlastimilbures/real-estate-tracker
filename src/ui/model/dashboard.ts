// Pure presentation model for the Dashboard's as-of tiles and monthly inflow / outflow
// band. The monthly figures are the engine's `monthlyFlow` of the tiles' snapshot.
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
  Portfolio,
  PortfolioSnapshot,
  ProjectionYear,
  Property,
  PropertySnapshot,
} from "../../engine";
import { fmtDate } from "../../lib/format";
import type { Mode } from "./lens";
import type { Dictionary } from "../../i18n";
import { periodLabelLocalized, yearLabel, type SeriesRow } from "./projection";
import { at } from "../../lib/arrays";

/** A portfolio's or a property's flow per month (ADR 0200, 0215), from the engine. */
export { monthlyFlow } from "../../engine";

/** Projection year (0..horizon) closest to an as-of date, on the baseDate-anchored
 *  whole-year grid the projection/charts use. ≤ baseDate ⇒ 0 (the current snapshot).
 *  Months count on the month-end grid (ADR 0021), as value growth and the CPI index count
 *  them, so 31 Aug → 28 Feb is six months (ADR 0150). */
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

/** The as-of a property's figures are read at: its basis, the resolved date the snapshot
 *  was evaluated at, and the assumptions (base date, price index). One object, so the as-of
 *  date cannot be swapped with a purchase or base date. */
interface AsOfContext {
  basis: AsOfBasis;
  asOf: Date;
  assumptions: Assumptions;
}

/** One property's inputs to its tiles: its engine snapshot, its lens-adjusted projection
 *  rows and its purchase date. */
interface PropertyFigures {
  snapshot: PropertySnapshot;
  series: SeriesRow[];
  purchaseDate: Date;
}

/**
 * Property-detail counterpart of `tilesForAsOf` (ADR 0019): the same as-of basis, so
 * the property tiles add up to the Dashboard. The property snapshot carries no `asOf`,
 * so the caller passes the date it was evaluated at. `owned` follows `ownedOn` under the
 * same basis, so a pending purchase reads the same on the tiles, the subtitle and the
 * Properties row (ADR 0156).
 */
export function propertyTilesForAsOf(
  { snapshot, series, purchaseDate }: PropertyFigures,
  { basis, asOf, assumptions }: AsOfContext,
  mode: Mode,
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
  isToday: boolean,
): AsOfBasis {
  const n = projectionYearForAsOf(baseDate, asOf);
  if (n > 0)
    return {
      kind: "projection",
      year: n,
      // As the engine numbers projection rows.
      calendarYear: baseDate.getUTCFullYear() + n,
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

/** A Properties row: the property's tiles plus its purchase date (ADR 0156). */
type PropertyRow = PropertySnapshot & { purchaseDate: Date };

/**
 * The Properties rows (ADR 0150): each property's Property detail tiles at `asOf` under
 * `basis`, in nominal Kč (the page has no lens), so a row and its detail page show the same
 * figures for the same date. `projections` holds every listed property's projection.
 */
export function propertyRowsForAsOf(
  perProperty: PropertySnapshot[],
  properties: readonly Property[],
  projections: ReadonlyMap<string, ProjectionYear[]>,
  ctx: AsOfContext,
): PropertyRow[] {
  const purchase = new Map(properties.map((p) => [p.id, p.purchaseDate]));
  return perProperty.map((p) => {
    // Every row comes from `properties`, so its purchase date is always there.
    const purchaseDate = purchase.get(p.propertyId) ?? ctx.asOf;
    return {
      ...propertyTilesForAsOf(
        {
          snapshot: p,
          // Nominal rows are the projection itself.
          series: projections.get(p.propertyId) ?? [],
          purchaseDate,
        },
        ctx,
        "nominal",
      ),
      purchaseDate,
    };
  });
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

/** The basis the Dashboard strip's figures are for, as a phrase (ADR 0088, 0200 §2):
 *  current, a projection year (the Projections year label) or a date. */
export function basisText(t: Dictionary, basis: AsOfBasis): string {
  const d = t.dashboard;
  if (basis.kind === "today") return d.basisCurrent;
  if (basis.kind === "snapshot") return d.basisOn(fmtDate(basis.date));
  return d.basisProjection(yearLabel(t, basis.year, basis.calendarYear));
}

/** The KPI band's as-of caption: the basis, starting with a capital (ADR 0222 §2). */
export function basisCaption(t: Dictionary, basis: AsOfBasis): string {
  const text = basisText(t, basis);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** How the KPI list's monthly figures are made (ADR 0088 §3, kept by ADR 0200 §3): a
 *  projection year's are its annual figures ÷ 12; otherwise the run rate of the leases
 *  in force on the as-of date ÷ 12. */
export function monthlyFlowHint(
  t: Dictionary,
  basis: AsOfBasis,
  asOf: Date,
): string {
  const d = t.dashboard;
  return basis.kind === "projection"
    ? d.monthlyHintProjection
    : d.monthlyHint(fmtDate(asOf));
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

/** What the Dashboard subtitle notes: the property filter (`effectiveCount` of
 *  `totalCount` shown) and the as-of date. */
interface SubtitleInput {
  filterActive: boolean;
  effectiveCount: number;
  totalCount: number;
  isToday: boolean;
  asOf: Date;
}

/**
 * Dashboard page subtitle: notes an active property filter and/or a non-today as-of
 * date; falls back to a plain default when neither applies.
 */
export function dashboardSubtitle(
  t: Dictionary,
  { filterActive, effectiveCount, totalCount, isToday, asOf }: SubtitleInput,
): string {
  const parts: string[] = [];
  if (filterActive)
    parts.push(t.dashboard.subFilter(effectiveCount, totalCount));
  if (!isToday) parts.push(t.dashboard.asOf(fmtDate(asOf)));
  return parts.length ? parts.join(" · ") : t.dashboard.subtitleDefault;
}

/** The Dashboard filter to store once the saved one names a property that is no longer
 *  active (ADR 0180 §7): the active ids it keeps, or no filter (`[]`) when those filter
 *  nothing. `null` when every saved id is active, so a filter picked by hand stays. */
export function prunedFilter(
  saved: readonly string[],
  activeIds: ReadonlySet<string>,
): string[] | null {
  const kept = saved.filter((id) => activeIds.has(id));
  if (kept.length === saved.length) return null;
  return kept.length < activeIds.size ? kept : [];
}

/** The Dashboard's property filter (ADR 0155, 0180 §7), from the saved ids. Only active
 *  properties get a chip, so an id of a now-deactivated one is dropped: the dashboard
 *  falls back to "All" instead of rendering zeroes for an invisible chip. A filter that
 *  keeps every active property filters nothing. `pruned` is what to store back (see
 *  `prunedFilter`), and only once the portfolio is loaded: before, every id looks
 *  inactive. */
export function dashboardFilter(
  portfolio: Pick<Portfolio, "properties"> | null,
  saved: readonly string[],
) {
  const properties = (portfolio?.properties ?? []).filter((p) => p.active);
  const activeIds = new Set(properties.map((p) => p.id));
  const effectiveIds = saved.filter((id) => activeIds.has(id));
  return {
    properties,
    effectiveIds,
    filterActive:
      effectiveIds.length > 0 && effectiveIds.length < properties.length,
    pruned: portfolio ? prunedFilter(saved, activeIds) : null,
  };
}
