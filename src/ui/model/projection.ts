// Pure presentation model for projections: selects the Nominal/Real lens and exposes
// per-year rows. Real terms come from the engine (CPI index, D-23); ratios like LTV are
// lens-invariant. Returns Decimals so the grid formats at full precision; charts convert
// at their edge.
import type { Decimal } from "../../lib/money";
import { cpiIndex, edate, realProjection } from "../../engine";
import type { Assumptions, ProjectionYear } from "../../engine";
import type { Mode } from "./lens";
import type { XlsxColumn } from "./xlsxExport";
import { nonZeroColumns } from "./columns";
import type { Dictionary } from "../../i18n";

export interface SeriesRow {
  year: number;
  calendarYear: number;
  value: Decimal;
  balance: Decimal;
  committedDebt: Decimal; // balance + undrawn development tranches (ADR 0166)
  undrawnDebt: Decimal; // the development tranches not drawn yet (ADR 0169)
  reportedValue: Decimal; // value − undrawnDebt, shown beside the drawn balance (ADR 0169)
  equity: Decimal;
  ltv: Decimal | null; // null when debt is owed on no value (ADR 0133)
  grossRent: Decimal;
  effectiveRent: Decimal;
  holdingCosts: Decimal;
  noi: Decimal;
  interest: Decimal;
  principal: Decimal;
  debtService: Decimal;
  netCashFlow: Decimal;
  // Net cash flow less the owner's cash outside it (lensed, ADR 0161); Σ of years
  // 1..N is the Dashboard's cumulative cash to owner. Zero in year 0.
  cashToOwner: Decimal;
  dscr: Decimal | null;
  // New debt drawn this year (lensed), from the engine (DR-092): zero unless a loan,
  // tranche or refinance draws in the year; zero in year 0.
  draws: Decimal;
  // New committed debt in the year: draws less development tranches already committed
  // (ADR 0166); the equity-change chart's new-debt stack.
  committedDraws: Decimal;
  // The value a future purchase brings in, in its turn-on year (lensed, ADR 0165); zero
  // in every other year.
  acquiredValue: Decimal;
  // A refinance handover's difference this year (lensed, ADR 0130); zero in year 0.
  refinanced: Decimal;
  // Extra principal prepaid this year (lensed, ADR 0109); zero in year 0.
  prepaid: Decimal;
  // Fees charged on this year's prepayments (lensed, ADR 0109); zero in year 0.
  prepaymentFees: Decimal;
}

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
  const rows =
    mode === "real"
      ? realProjection(projection, cpiIndex(assumptions))
      : projection;
  return rows.map((y) => ({
    year: y.year,
    calendarYear: y.calendarYear,
    value: y.value,
    balance: y.balance,
    committedDebt: y.committedDebt,
    undrawnDebt: y.undrawnDebt,
    reportedValue: y.reportedValue,
    equity: y.equity,
    ltv: y.ltv,
    grossRent: y.grossRent,
    effectiveRent: y.effectiveRent,
    holdingCosts: y.holdingCosts,
    noi: y.noi,
    interest: y.interest,
    principal: y.principal,
    debtService: y.debtService,
    netCashFlow: y.netCashFlow,
    cashToOwner: y.cashToOwner,
    dscr: y.dscr,
    draws: y.draws,
    committedDraws: y.committedDraws,
    acquiredValue: y.acquiredValue,
    refinanced: y.refinanced,
    prepaid: y.prepaid,
    prepaymentFees: y.prepaymentFees,
  }));
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
