// Pure chart-data helpers (kept out of the component file so fast-refresh stays happy).
// Engine Decimals → plain numbers happens HERE, the chart boundary.
import { toNumber, type Decimal } from "../../lib/money";
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

/** The committed-debt line's dash: drawn debt + the tranches not drawn yet (ADR 0169). */
export const COMMITTED_DASH = "6 3";

// A type alias (not interface) so it's structurally assignable to Record<string, number>
// — the charts accept arbitrary string-keyed series for the Scenarios compare view.
export type ChartRow = {
  /** Projection year t (0 = opening), for the "Y5 · 2031" tooltip label (UX-032). */
  year: number;
  calendarYear: number;
  value: number;
  balance: number;
  // ADR 0169: the drawn balance + the tranches not drawn yet, plotted dashed only while
  // a tranche is ahead and in the year after, so it ends on the drawn line; else null.
  committedDebt: number | null;
  equity: number;
  ltv: number | null; // null: debt on no value, a gap in the line (ADR 0133)
  // Flows are null in year 0 (the opening point has none), so the lines start at year 1
  // instead of rising from a plotted 0 (UX-033).
  grossRent: number | null;
  effectiveRent: number | null;
  noi: number | null;
  debtService: number | null;
  netCashFlow: number | null;
};

// Year-on-year equity change, split into the four things that drive it. Because
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
// A future purchase's value enters equity in its turn-on year; the engine reports it as
// `acquiredValue` (ADR 0165), shown as its own "purchases" stack and taken out of the
// appreciation residual, so the stacks still sum exactly to the equity change.
// A refinance handover's difference (`refinanced`, ADR 0130) moves the balance like a
// draw, so the drawdown bar carries it too (negative when the owner pays down at a refix).
// Equity is value − committed debt (ADR 0166), so the new-debt stack is `committedDraws`:
// a development tranche drawn this year was already committed and shows no bar.
export type EquityChangeRow = {
  year: number;
  calendarYear: number;
  appreciation: number; // value[t] − value[t−1] − purchases  (negative in a crash year)
  purchases: number; // value a purchase brings in in year t (≥ 0, ADR 0165)
  paydown: number; // principal repaid in year t, prepaid included (≥ 0) (equity gained by repaying)
  drawdown: number; // −(new debt drawn in year t) (≤ 0)       (equity lost to fresh borrowing)
};

/** Per-year equity change decomposed into appreciation + purchases + debt paydown + new
 *  draws. Starts at year 1 (year 0 is the opening snapshot — no prior year). Deltas
 *  computed in Decimal, converted to number at this chart boundary. */
export function toEquityChangeRows(series: SeriesRow[]): EquityChangeRow[] {
  const n = (d: Decimal) => toNumber(d);
  return series.slice(1).map((r, i) => {
    const prev = at(series, i); // sliced: prev is series[i], current is series[i+1] === r
    return {
      year: r.year,
      calendarYear: r.calendarYear,
      // residual: keeps the four stacks === equity[t] − equity[t−1].
      appreciation: n(
        r.equity
          .minus(prev.equity)
          .minus(r.acquiredValue)
          .minus(r.principal)
          .minus(r.prepaid)
          .plus(r.committedDraws)
          .plus(r.refinanced),
      ),
      purchases: n(r.acquiredValue),
      paydown: n(r.principal.plus(r.prepaid)),
      drawdown: n(r.committedDraws.plus(r.refinanced).negated()),
    };
  });
}

/** True when some year has a purchase: the chart shows the Purchases stack only then
 *  (ADR 0165), so a portfolio owned at baseDate keeps its three stacks. */
export function hasPurchases(rows: EquityChangeRow[]): boolean {
  return rows.some((r) => r.purchases !== 0);
}

/** True when some year has development tranches not drawn yet: the value and debt
 *  chart then adds the dashed committed-debt line (ADR 0169). */
export function hasUndrawn(rows: ChartRow[]): boolean {
  return rows.some((r) => r.committedDebt !== null);
}

/** Decimal series → plain-number rows for plotting. */
export function toChartRows(series: SeriesRow[]): ChartRow[] {
  const n = (d: Decimal) => toNumber(d);
  return series.map((r, i) => {
    const flow = (d: Decimal) => (r.year <= 0 ? null : n(d));
    const prev = i > 0 ? at(series, i - 1) : undefined;
    const drawing =
      !r.undrawnDebt.isZero() || (prev && !prev.undrawnDebt.isZero());
    return {
      year: r.year,
      calendarYear: r.calendarYear,
      // The drawn balance, and the value less the tranches not drawn yet, so
      // value − debt = equity (ADR 0169).
      value: n(r.reportedValue),
      balance: n(r.balance),
      committedDebt: drawing ? n(r.committedDebt) : null,
      equity: n(r.equity),
      ltv: r.ltv === null ? null : n(r.ltv),
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

/** One tooltip row: a series' label, value, colour and dash (ADR 0114). */
export interface TipItem {
  label: string;
  value: number | null; // null: not plotted (e.g. a year-0 flow) ⇒ "—"
  color: string;
  dash?: string | undefined;
  kind: "czk" | "pct";
}

/** Tooltip rows for keyed series. Name and dash come from `series`: Recharts' payload
 *  carries neither (ADR 0114). The colour comes from the payload. */
export function seriesTipItems(
  payload:
    | readonly { dataKey?: unknown; value?: unknown; color?: unknown }[]
    | undefined,
  series: readonly { key: string; name: string; dash?: string | undefined }[],
  kind: TipItem["kind"],
  value: (v: unknown) => number | null = tipValue,
): TipItem[] {
  return (payload ?? []).map((p) => {
    const s = series.find((x) => x.key === p.dataKey);
    return {
      label: s?.name ?? String(p.dataKey),
      value: value(p.value),
      color: String(p.color),
      dash: s?.dash,
      kind,
    };
  });
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
