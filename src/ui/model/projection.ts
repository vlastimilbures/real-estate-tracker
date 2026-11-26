// Pure presentation model for projections: selects the Nominal/Real lens and exposes
// per-year rows. Real terms come from the engine (CPI index, ADR 0023); ratios like LTV
// are lens-invariant. Returns Decimals so the grid formats at full precision; charts
// convert at their edge.
import { Decimal } from "../../lib/money";
import { cpiIndex, edate, purchasedValue, realProjection } from "../../engine";
import type { Assumptions, ProjectionYear } from "../../engine";
import type { Mode } from "./lens";
import type { CellKind, XlsxColumn } from "./xlsxExport";
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

/** "Y5 · 2031": projection year t with its calendar year (ADR 0022). The prefix is
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

/** A Year cell's span, its tooltip and screen-reader text; none with calendar years
 *  (ADR 0211 §1). */
export function yearCellPeriod(
  t: Pick<Dictionary, "projGrid" | "monthsShort">,
  baseDate: Date,
  year: number,
): string | null {
  return showPeriodColumn(baseDate)
    ? periodLabelLocalized(baseDate, year, t.monthsShort, t.projGrid.opening)
    : null;
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
function undrawnColumn(rows: SeriesRow[], g: Dictionary["projGrid"]) {
  return nonZeroColumns(rows, [{ key: "undrawnDebt", header: g.undrawn }]);
}

/** The Purchases column, shown only when some year has a purchase or construction
 *  (ADR 0194). It follows Value. */
function purchasesColumn(rows: SeriesRow[], g: Dictionary["projGrid"]) {
  return nonZeroColumns(
    rows.map((r) => ({ purchases: purchasedValue(r) })),
    [{ key: "purchases", header: g.purchases }],
  );
}

/** How a projection column's cell shows. Money is a stock (every year, a negative in
 *  parentheses only for `balance`) or a flow, which the opening row (year 0) has none of:
 *  the engine sets its flow fields to 0, so the grid dashes them and the export leaves
 *  them empty. A `signedFlow` shows its sign's tone on screen. */
export type ProjectionCell =
  "stock" | "balance" | "flow" | "signedFlow" | "percent" | "multiple";

/** One column after Year, as the grid and the Excel export both show it. */
export interface ProjectionColumn {
  key: string;
  header: string;
  /** The glossary term the grid's header explains. */
  term?: keyof Dictionary["guide"]["glossary"];
  cell: ProjectionCell;
  value: (r: SeriesRow) => Decimal | null;
}

/** Every projection column after Year, in order, for ProjectionGrid and its export, so
 *  the two cannot drift apart: a column is one entry here. The optional ones show only
 *  when some year has a value for them. */
export function projectionGridColumns(
  rows: SeriesRow[],
  g: Dictionary["projGrid"],
): ProjectionColumn[] {
  const col = (
    key: string,
    header: string,
    cell: ProjectionCell,
    value: (r: SeriesRow) => Decimal | null,
    term?: ProjectionColumn["term"],
  ): ProjectionColumn => ({ key, header, cell, value, ...(term && { term }) });
  return [
    // ADR 0169: the value less the tranches not drawn yet, a purchase's value and
    // construction (ADR 0194), the drawn balance, and those tranches while a
    // development loan draws.
    col("value", g.value, "stock", (r) => r.reportedValue),
    ...purchasesColumn(rows, g).map(({ key, header }) =>
      col(key, header, "flow", purchasedValue),
    ),
    col("debt", g.debt, "stock", (r) => r.balance),
    ...undrawnColumn(rows, g).map(({ key, header }) =>
      col(key, header, "stock", (r) => r[key]),
    ),
    col("equity", g.equity, "balance", (r) => r.equity),
    col("ltv", g.ltv, "percent", (r) => r.ltv, "ltv"),
    col("grossRent", g.grossRent, "flow", (r) => r.grossRent),
    col("effectiveRent", g.effective, "flow", (r) => r.effectiveRent, "egi"),
    col("holding", g.holding, "flow", (r) => r.holdingCosts),
    col("noi", g.noi, "signedFlow", (r) => r.noi, "noi"),
    col("interest", g.interest, "flow", (r) => r.interest),
    col("principal", g.principal, "flow", (r) => r.principal),
    col("debtSvc", g.debtSvc, "flow", (r) => r.debtService),
    col("netCf", g.netCf, "signedFlow", (r) => r.netCashFlow),
    col("cashToOwner", g.cashToOwner, "signedFlow", (r) => r.cashToOwner),
    col("dscr", g.dscr, "multiple", (r) => r.dscr, "dscr"),
    ...projectionExtras(rows, g).map(({ key, header }) =>
      col(key, header, "flow", (r) => r[key]),
    ),
  ];
}

/** Whether a column's cell is a flow, which the opening row has none of. */
function isFlow(cell: ProjectionCell): boolean {
  return cell === "flow" || cell === "signedFlow";
}

const XLSX_KIND: Record<ProjectionCell, CellKind> = {
  stock: "money",
  balance: "money",
  flow: "money",
  signedFlow: "money",
  percent: "percent",
  multiple: "multiple",
};

/**
 * Excel column map: the Year (calendar year), the Period when projection years are not
 * calendar years, then ProjectionGrid's columns with their headers as plain text in the
 * UI language. Each column's kind rounds and formats its cells as the grid shows them
 * (ADR 0010); opening-row (year ≤ 0) flow cells are blanked like the "—" on screen.
 */
export function projectionColumns(
  t: Pick<Dictionary, "projGrid" | "monthsShort">,
  baseDate: Date,
  rows: SeriesRow[],
): XlsxColumn<SeriesRow>[] {
  const g = t.projGrid;
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
  for (const c of projectionGridColumns(rows, g)) {
    const flow = isFlow(c.cell);
    cols.push({
      header: c.header,
      kind: XLSX_KIND[c.cell],
      value: (r) => (flow && r.year <= 0 ? null : c.value(r)),
    });
  }
  return cols;
}
