// Pure presentation model for projections: selects the Nominal/Real lens and exposes
// per-year rows. Real terms come from the engine (CPI index, D-23); ratios like LTV are
// lens-invariant. Returns Decimals so the grid formats at full precision; charts convert
// at their edge.
import { Decimal } from "../../lib/money";
import { cpiIndex, edate, realProjection } from "../../engine";
import type { Assumptions, ProjectionYear } from "../../engine";
import type { Mode } from "./lens";
import type { XlsxColumn } from "./xlsxExport";
import { nonZeroColumns } from "./columns";
import type { Dictionary } from "../../i18n";

/** A projection year as the grid, charts and tiles read it, under the chosen lens. */
export type SeriesRow = Pick<
  ProjectionYear,
  | "year"
  | "calendarYear"
  | "value"
  | "balance"
  | "committedDebt"
  | "undrawnDebt"
  | "reportedValue"
  | "equity"
  | "ltv"
  | "grossRent"
  | "effectiveRent"
  | "holdingCosts"
  | "noi"
  | "interest"
  | "principal"
  | "debtService"
  | "netCashFlow"
  | "cashToOwner"
  | "dscr"
  | "draws"
  | "committedDraws"
  | "acquiredValue"
  | "refinanced"
  | "prepaid"
  | "prepaymentFees"
>;

/** "Y5 · 2031": projection year t with its calendar year (D-22, UX-032). The prefix is
 *  the UI language's one-letter abbreviation for "year". */
export function yearLabel(
  t: Pick<Dictionary, "projGrid">,
  year: number,
  calendarYear: number,
): string {
  return `${t.projGrid.yearPrefix}${year} · ${calendarYear}`;
}

/** Localized variant for the on-screen Period column: caller supplies translated short
 *  month names + the "opening" label. Year t spans grid months (t−1)·12+1 … t·12. */
export function periodLabelLocalized(
  baseDate: Date,
  year: number,
  months: readonly string[],
  openingLabel: string,
): string {
  if (year <= 0) return openingLabel;
  const my = (d: Date) => `${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  const start = edate(baseDate, (year - 1) * 12 + 1);
  const end = edate(baseDate, year * 12);
  return `${my(start)} – ${my(end)}`;
}

/** Whether the fiscal year diverges from the calendar year (Period column relevant). */
export function showPeriodColumn(baseDate: Date): boolean {
  return edate(baseDate, 1).getUTCMonth() !== 0;
}

/** Map the engine's per-year projection into display rows under the chosen lens. */
export function projectionSeries(
  projection: ProjectionYear[],
  mode: Mode,
  assumptions: Assumptions,
): SeriesRow[] {
  return mode === "real"
    ? realProjection(projection, cpiIndex(assumptions))
    : projection;
}

/**
 * The owner-cash columns outside net cash flow, with their headers, each shown only when
 * some year is non-zero (ADR 0116 §12). They follow DSCR, apart from the operating columns.
 */
export function projectionExtras(rows: SeriesRow[], g: Dictionary["projGrid"]) {
  return nonZeroColumns(rows, [
    // The Debt column is the drawn balance, so it reconciles year to year (ADR 0169).
    { key: "draws", header: g.draws },
    { key: "refinanced", header: g.refinanced },
    { key: "prepaid", header: g.prepaid },
    { key: "prepaymentFees", header: g.prepaymentFees },
  ]);
}

/** The Undrawn column, shown only while a development loan has tranches ahead
 *  (ADR 0169). It follows Debt. */
export function undrawnColumn(rows: SeriesRow[], g: Dictionary["projGrid"]) {
  return nonZeroColumns(rows, [{ key: "undrawnDebt", header: g.undrawn }]);
}

/** What a year's development draws build (ADR 0170): the tranches drawn for construction,
 *  less, in a purchase year, the tranches the bought flat has not drawn yet. */
export function builtValue(r: SeriesRow): Decimal {
  const released = r.draws.minus(r.committedDraws);
  return Decimal.min(Decimal.max(released, r.acquiredValue.negated()), r.draws);
}

/** The value purchases and construction add in a year, apart from growth: the
 *  equity-change chart's Purchases stack and the grid's Purchases column (ADR 0194). */
export function purchasedValue(r: SeriesRow): Decimal {
  return r.acquiredValue.plus(builtValue(r));
}

/** The Purchases column, shown only when some year has a purchase or construction
 *  (ADR 0194). It follows Value. */
export function purchasesColumn(rows: SeriesRow[], g: Dictionary["projGrid"]) {
  return nonZeroColumns(
    rows.map((r) => ({ purchases: purchasedValue(r) })),
    [{ key: "purchases", header: g.purchases }],
  );
}

/**
 * Excel column map mirroring ProjectionGrid's columns, order and headers in the UI
 * language (UX-062). Each column's kind rounds and formats its cells as the grid shows
 * them (D-10); opening-row (year ≤ 0) flow cells are blanked like the "—" on screen.
 */
export function projectionColumns(
  t: Pick<Dictionary, "projGrid" | "monthsShort">,
  baseDate: Date,
  rows: SeriesRow[],
): XlsxColumn<SeriesRow>[] {
  const g = t.projGrid;
  // Flow fields are structurally N/A in the opening snapshot row.
  const flow = (pick: (r: SeriesRow) => Decimal) => (r: SeriesRow) =>
    r.year <= 0 ? null : pick(r);
  const cols: XlsxColumn<SeriesRow>[] = [
    { header: g.year, kind: "int", value: (r) => r.calendarYear },
  ];
  if (showPeriodColumn(baseDate)) {
    cols.push({
      header: g.period,
      kind: "text",
      value: (r) =>
        periodLabelLocalized(baseDate, r.year, t.monthsShort, g.opening),
    });
  }
  cols.push(
    // ADR 0169: the drawn balance, and the value less the tranches not drawn yet.
    { header: g.value, kind: "money", value: (r) => r.reportedValue },
    ...purchasesColumn(rows, g).map(({ header }): XlsxColumn<SeriesRow> => ({
      header,
      kind: "money",
      value: flow(purchasedValue),
    })),
    { header: g.debt, kind: "money", value: (r) => r.balance },
    ...undrawnColumn(rows, g).map(({ header }): XlsxColumn<SeriesRow> => ({
      header,
      kind: "money",
      value: (r) => r.undrawnDebt,
    })),
    { header: g.equity, kind: "money", value: (r) => r.equity },
    { header: g.ltv, kind: "percent", value: (r) => r.ltv },
    { header: g.grossRent, kind: "money", value: flow((r) => r.grossRent) },
    { header: g.effective, kind: "money", value: flow((r) => r.effectiveRent) },
    { header: g.holding, kind: "money", value: flow((r) => r.holdingCosts) },
    { header: g.noi, kind: "money", value: flow((r) => r.noi) },
    { header: g.interest, kind: "money", value: flow((r) => r.interest) },
    { header: g.principal, kind: "money", value: flow((r) => r.principal) },
    { header: g.debtSvc, kind: "money", value: flow((r) => r.debtService) },
    { header: g.netCf, kind: "money", value: flow((r) => r.netCashFlow) },
    {
      header: g.cashToOwner,
      kind: "money",
      value: flow((r) => r.cashToOwner),
    },
    { header: g.dscr, kind: "multiple", value: (r) => r.dscr },
    ...projectionExtras(rows, g).map(
      ({ key, header }): XlsxColumn<SeriesRow> => ({
        header,
        kind: "money",
        value: flow((r) => r[key]),
      }),
    ),
  );
  return cols;
}

/** Short property label for the Projections picker: drops the leading "Byt " (flat). */
export function shortPropertyName(name: string): string {
  return name.replace(/^Byt /, "");
}
