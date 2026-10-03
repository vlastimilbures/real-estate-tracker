// Pure chart-data helpers (kept out of the component file so fast-refresh stays happy).
// Engine Decimals → plain numbers happens HERE, the chart boundary.
import { toNumber, type Decimal } from "../../lib/money";
import { fmtCzkAxisTick, type CzkAxisUnit } from "../../lib/format";
import { yearLabel, type SeriesRow } from "./projection";
import type { Dictionary } from "../../i18n";
import { at } from "../../lib/arrays";

// Point at the CSS tokens (not literal hex) so charts re-theme with light/dark. CSS
// variables resolve inside SVG, so these flow straight into recharts stroke/fill/Cell
// and the DOM legend/tooltip swatches.
export const SERIES = {
  petrol: "var(--series-1)",
  brass: "var(--series-2)",
  slate: "var(--series-3)",
  clay: "var(--series-4)",
  sand: "var(--series-5)",
  positive: "var(--positive)",
  negative: "var(--negative)",
} as const;

// A type alias (not interface) so it's structurally assignable to Record<string, number>
// — the charts accept arbitrary string-keyed series for the Scenarios compare view.
export type ChartRow = {
  /** Projection year t (0 = opening), for the "Y5 · 2031" tooltip label (UX-032). */
  year: number;
  calendarYear: number;
  value: number;
  balance: number;
  equity: number;
  ltv: number;
  // Flows are null in year 0 (the opening point has none), so the lines start at year 1
  // instead of rising from a plotted 0 (UX-033).
  grossRent: number | null;
  effectiveRent: number | null;
  noi: number | null;
  debtService: number | null;
  netCashFlow: number | null;
};

// Year-on-year equity change, split into the three forces that drive it. Because
// equity = value − balance and balance[t] = balance[t−1] − principal[t] + draws[t], the
// balance delta is two economically opposite things: principal *repaid* (raises equity)
// and new debt *drawn* (lowers equity). Splitting them keeps a development loan's draw
// years from masquerading as debt repayment.
//
// `draws` comes straight off the (lensed) SeriesRow: the engine's nominal draws per year
// (DR-092) deflated by a single year factor, so it is exactly zero for years without new
// debt under either lens. We MUST NOT recompute it here from the lensed
// balances: in real terms balance[t] and balance[t−1] carry different deflators, so the
// back-out leaves a residual (the inflation erosion of the prior balance) that would show up
// as phantom drawdown bars. Instead appreciation is the residual, absorbing that erosion as a
// value-side effect. The three stacks still sum *exactly* to equity[t]−equity[t−1]:
//   appreciation + paydown + drawdown = (equity Δ − principal + draws) + principal − draws.
// In the nominal lens this collapses to appreciation = value Δ exactly (unchanged behaviour).
export type EquityChangeRow = {
  year: number;
  calendarYear: number;
  appreciation: number; // value[t] − value[t−1]              (negative in a crash year)
  paydown: number; // principal repaid in year t, prepaid included (≥ 0) (equity gained by repaying)
  drawdown: number; // −(new debt drawn in year t) (≤ 0)       (equity lost to fresh borrowing)
};

/** Per-year equity change decomposed into appreciation + debt paydown + new draws. Starts
 *  at year 1 (year 0 is the opening snapshot — no prior year). Deltas computed in Decimal,
 *  converted to number at this chart boundary. */
export function toEquityChangeRows(series: SeriesRow[]): EquityChangeRow[] {
  const n = (d: Decimal) => toNumber(d);
  return series.slice(1).map((r, i) => {
    const prev = at(series, i); // sliced: prev is series[i], current is series[i+1] === r
    return {
      year: r.year,
      calendarYear: r.calendarYear,
      // residual: keeps appreciation + paydown + drawdown === equity[t] − equity[t−1].
      appreciation: n(
        r.equity
          .minus(prev.equity)
          .minus(r.principal)
          .minus(r.prepaid)
          .plus(r.draws),
      ),
      paydown: n(r.principal.plus(r.prepaid)),
      drawdown: n(r.draws.negated()),
    };
  });
}

/** Decimal series → plain-number rows for plotting. */
export function toChartRows(series: SeriesRow[]): ChartRow[] {
  const n = (d: Decimal) => toNumber(d);
  return series.map((r) => {
    const flow = (d: Decimal) => (r.year <= 0 ? null : n(d));
    return {
      year: r.year,
      calendarYear: r.calendarYear,
      value: n(r.value),
      balance: n(r.balance),
      equity: n(r.equity),
      ltv: n(r.ltv),
      grossRent: flow(r.grossRent),
      effectiveRent: flow(r.effectiveRent),
      noi: flow(r.noi),
      debtService: flow(r.debtService),
      netCashFlow: flow(r.netCashFlow),
    };
  });
}

/** A hovered point's value for the tooltip: a gap (null, e.g. a year-0 flow) stays null. */
export function tipValue(v: unknown): number | null {
  return v === null || v === undefined ? null : Number(v);
}

/** A chart-table cell's value (UX-075): a plotted number, or null for a gap. */
export function tableValue(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** A chart-table row's year cell: "Y5 · 2031" when the row carries the projection year,
 *  else its calendar year. */
export function tableYear(
  t: Pick<Dictionary, "projGrid">,
  row: Readonly<Record<string, unknown>>,
): string {
  const { year, calendarYear } = row;
  return typeof year === "number" && typeof calendarYear === "number"
    ? yearLabel(t, year, calendarYear)
    : String(calendarYear ?? "");
}

/** Total line of a stacked-bar tooltip: the sum of the hovered bars' plotted values. */
export function tooltipTotal(values: readonly number[]): number {
  return values.reduce((sum, v) => sum + v, 0);
}

/**
 * Y-axis pixel width so the longest tick never wraps: the longer of the largest positive
 * and the most negative tick (the minus sign counts). Recharts uses ~8 px per character
 * at the 12 px axis font; add 8 px padding.
 */
export function czkAxisWidth(
  unit: CzkAxisUnit,
  rows: readonly Record<string, unknown>[],
  keys: readonly string[],
): number {
  let max = 0;
  let min = 0;
  for (const row of rows)
    for (const k of keys) {
      const v = row[k];
      if (typeof v !== "number" || !Number.isFinite(v)) continue;
      if (v > max) max = v;
      if (v < min) min = v;
    }
  const longest = Math.max(
    fmtCzkAxisTick(max, unit).length,
    fmtCzkAxisTick(min, unit).length,
  );
  return Math.max(44, longest * 8 + 8);
}
