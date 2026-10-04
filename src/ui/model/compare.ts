// Pure presentation model for Scenario compare: picks each scenario's nominal or real
// projection (the engine deflates with the scenario's own CPI, D-23) and the key-figure
// rows for the lens (UX-055, DR-093). Moved out of ScenarioCompare.tsx.
import { fmtCzkM, fmtMultiple, fmtPct, fmtPp } from "../../lib/format";
import { toNumber, type Decimal } from "../../lib/money";
import type { PortfolioKPIs, ProjectionYear } from "../../engine";
import type { Dictionary } from "../../i18n";
import type { Mode } from "./lens";
import { irrReasonText, leveredIrr } from "./irr";
import { lensKpis } from "./lensKpis";
import { at } from "../../lib/arrays";
import { BASE_SCENARIO_ID } from "./scenarios";
import { SERIES } from "./chartData";
import type { Cell, CellKind } from "./xlsxExport";

/** One compared scenario: its projection in both lenses and its KPIs. */
export interface CompareResult {
  id: string;
  name: string;
  projection: ProjectionYear[];
  realProjection: ProjectionYear[];
  kpis: PortfolioKPIs;
}

export interface CompareKpiRow {
  label: string;
  fmt: (r: CompareResult) => string;
  /** Why a cell has no value, shown as its tooltip (UX-079). */
  note?: (r: CompareResult) => string | undefined;
  /** The cell points to the rebased-returns footnote (ADR 0089). */
  mark?: (r: CompareResult) => boolean;
}

/** A Values-view row with its typed cell for the Excel export (ADR 0108): `fmt` of the
 *  cell's value, rounded by `kind`, is the table's text. */
export interface CompareValueRow extends CompareKpiRow {
  kind: CellKind;
  value: (r: CompareResult) => Cell;
}

const pct = (d: Decimal | null) => (d ? fmtPct(d) : "—");
const mult = (d: Decimal | null) => (d ? fmtMultiple(d) : "—");

const rowsOf = (r: CompareResult, mode: Mode) =>
  mode === "real" ? r.realProjection : r.projection;

/** Equity in projection year 0 (CPI₀ = 1, so it is the same in both lenses). */
const startingEquity = (r: CompareResult) => at(r.projection, 0).equity;

/** A crash at Today lowers starting equity, so the returns are rebased (ADR 0089). */
const startsDifferently = (r: CompareResult, base: CompareResult) =>
  !startingEquity(r).eq(startingEquity(base));

interface LineStyle {
  color: string;
  dash?: string;
}

/** Up to four lines per chart (Base + 3 picks), each with its own colour and dash so
 *  they read in greyscale too; cycles if more are somehow selected (ADR 0114). */
const COMPARE_STYLES: readonly LineStyle[] = [
  { color: SERIES.petrol },
  { color: SERIES.clay, dash: "6 3" },
  { color: SERIES.brass, dash: "2 3" },
  { color: SERIES.slate, dash: "8 3 2 3" },
];

/** The line style of the i-th compared scenario; the first (Base, when shown) is solid. */
export function compareSeriesStyle(i: number): LineStyle {
  return at(COMPARE_STYLES, i % COMPARE_STYLES.length);
}

/** The Base scenario among the compared results, if it is selected. */
export function compareBase(
  results: CompareResult[],
): CompareResult | undefined {
  return results.find((r) => r.id === BASE_SCENARIO_ID);
}

/** How the key figures read: the values, or each scenario minus Base (ADR 0097). */
export type CompareView = "values" | "delta";

/** One Δ-vs-Base cell: its text and, when it has no value, why. */
interface DeltaCell {
  text: string;
  note?: string | undefined;
}

interface KpiRowSpec extends CompareValueRow {
  /** The scenario's value minus Base's, in the row's unit (ADR 0097). Rows without
   *  one are hidden in the Δ view. */
  delta?: (r: CompareResult, base: CompareResult) => DeltaCell;
}

/** "+" for a gain; the formatters already sign a loss and leave zero bare. */
const signed = (d: Decimal, fmt: (d: Decimal) => string) =>
  d.gt(0) ? `+${fmt(d)}` : fmt(d);

/** Key-figure rows. Starting equity and Δ net worth vs Base lead (ADR 0089); net worth
 *  shows both lenses; the multiple, CAGR, cumulative cash flow and IRR follow the lens
 *  (ADR 0087). The Δ row needs Base in the comparison. In the Δ view (with Base) every
 *  cell shows the scenario minus Base and the Δ net worth row is dropped (ADR 0097). */
export function compareKpiRows(
  t: Dictionary,
  mode: Mode,
  base?: CompareResult,
  view: CompareView = "values",
): CompareKpiRow[] {
  const rows = kpiRowSpecs(t, mode, base);
  if (view === "values" || !base) return rows;
  return rows.flatMap(({ delta, ...row }) =>
    delta
      ? [
          {
            ...row,
            fmt: (r: CompareResult) =>
              r.id === base.id ? "—" : delta(r, base).text,
            note: (r: CompareResult) =>
              r.id === base.id ? undefined : delta(r, base).note,
          },
        ]
      : [],
  );
}

/** The Values-view key figures with their typed cells, for the Excel export (ADR 0108). */
export function compareValueRows(
  t: Dictionary,
  mode: Mode,
  base?: CompareResult,
): CompareValueRow[] {
  return kpiRowSpecs(t, mode, base);
}

function kpiRowSpecs(
  t: Dictionary,
  mode: Mode,
  base: CompareResult | undefined,
): KpiRowSpec[] {
  const s = t.scenarios;
  const real = mode === "real";
  const netWorth = (r: CompareResult) =>
    real ? r.kpis.netWorthReal : r.kpis.netWorthNominal;
  const rebased = (r: CompareResult) =>
    base !== undefined && startsDifferently(r, base);

  // Δ cells: "—" when either side has no value, with a note when Base is the one missing.
  const missingBase = { text: "—", note: s.deltaNoBaseValue };
  const decimalDelta =
    (pick: (r: CompareResult) => Decimal | null, fmt: (d: Decimal) => string) =>
    (r: CompareResult, b: CompareResult): DeltaCell => {
      const v = pick(r);
      const w = pick(b);
      if (v === null) return { text: "—" };
      if (w === null) return missingBase;
      return { text: signed(v.minus(w), fmt) };
    };
  const yearDelta =
    (pick: (r: CompareResult) => number | null) =>
    (r: CompareResult, b: CompareResult): DeltaCell => {
      const v = pick(r);
      const w = pick(b);
      if (v === null) return { text: "—" };
      if (w === null) return missingBase;
      return { text: s.deltaYears(v - w) };
    };
  const pp = (d: Decimal) => `${fmtPp(d)} ${s.ppSuffix}`;
  const irrRate = (r: CompareResult) => leveredIrr(r.kpis, mode).rate;
  const irrDelta = decimalDelta(irrRate, pp);

  // Each row's value, shared by its text, its Δ and its export cell.
  const startEquity = (r: CompareResult) => at(rowsOf(r, mode), 0).equity;
  const multiple = (r: CompareResult) =>
    lensKpis(r.kpis, mode).netWorthMultiple;
  const cagr = (r: CompareResult) =>
    real ? r.kpis.cagrReal : r.kpis.cagrNominal;
  const cumCf = (r: CompareResult) =>
    lensKpis(r.kpis, mode).cumulativeNetCashFlow;
  const firstCfYear = (r: CompareResult) => r.kpis.firstCashFlowPositiveYear;
  const debtFreeYear = (r: CompareResult) => r.kpis.debtFreeYear;

  return [
    {
      label: s.kpiStartingEquity,
      fmt: (r) => fmtCzkM(startEquity(r)),
      kind: "money",
      value: startEquity,
      delta: decimalDelta(startEquity, fmtCzkM),
    },
    ...(base
      ? [
          {
            label: s.kpiNetWorthDeltaVsBase,
            fmt: (r: CompareResult) => {
              if (r.id === base.id) return "—";
              return signed(netWorth(r).minus(netWorth(base)), fmtCzkM);
            },
            kind: "money" as const,
            value: (r: CompareResult) =>
              r.id === base.id ? null : netWorth(r).minus(netWorth(base)),
          },
        ]
      : []),
    {
      label: s.kpiNetWorthNominal,
      fmt: (r) => fmtCzkM(r.kpis.netWorthNominal),
      kind: "money",
      value: (r) => r.kpis.netWorthNominal,
      delta: decimalDelta((r) => r.kpis.netWorthNominal, fmtCzkM),
    },
    {
      label: s.kpiNetWorthReal,
      fmt: (r) => fmtCzkM(r.kpis.netWorthReal),
      kind: "money",
      value: (r) => r.kpis.netWorthReal,
      delta: decimalDelta((r) => r.kpis.netWorthReal, fmtCzkM),
    },
    {
      label: s.kpiNetWorthMultiple,
      fmt: (r) => mult(multiple(r)),
      kind: "multiple",
      value: multiple,
      mark: rebased,
      delta: decimalDelta(multiple, fmtMultiple),
    },
    {
      label: real ? s.kpiCagrReal : s.kpiCagrNominal,
      fmt: (r) => pct(cagr(r)),
      kind: "percent",
      value: cagr,
      mark: rebased,
      delta: decimalDelta(cagr, pp),
    },
    {
      label: s.kpiCumulativeNetCf,
      fmt: (r) => fmtCzkM(cumCf(r)),
      kind: "money",
      value: cumCf,
      delta: decimalDelta(cumCf, fmtCzkM),
    },
    {
      label: real ? s.kpiLeveredIrrReal : s.kpiLeveredIrrNominal,
      fmt: (r) => {
        const rate = irrRate(r);
        return rate ? fmtPct(rate) : t.common.notApplicable;
      },
      kind: "percent",
      value: (r) => irrRate(r) ?? t.common.notApplicable,
      note: (r) => irrReasonText(t, leveredIrr(r.kpis, mode).reason),
      mark: rebased,
      // A scenario IRR without a value keeps its reason (UX-079).
      delta: (r, b) =>
        irrRate(r) === null
          ? {
              text: "—",
              note: irrReasonText(t, leveredIrr(r.kpis, mode).reason),
            }
          : irrDelta(r, b),
    },
    {
      label: s.kpiFirstCfPositiveYear,
      fmt: (r) => firstCfYear(r)?.toString() ?? "—",
      kind: "int",
      value: firstCfYear,
      delta: yearDelta(firstCfYear),
    },
    {
      label: s.kpiDebtFreeYear,
      fmt: (r) => debtFreeYear(r)?.toString() ?? "—",
      kind: "int",
      value: debtFreeYear,
      delta: yearDelta(debtFreeYear),
    },
  ];
}

/** Footnote for the marked returns: names each scenario whose starting equity differs
 *  from Base's; null without Base or when none differs (ADR 0089). */
export function compareFootnote(
  t: Dictionary,
  results: CompareResult[],
): string | null {
  const base = compareBase(results);
  if (!base) return null;
  const names = results
    .filter((r) => startsDifferently(r, base))
    .map((r) => r.name);
  return names.length
    ? t.scenarios.rebasedReturnsFootnote(names.join(", "))
    : null;
}

/** Key-figures panel hint for the lens. */
export function compareHint(t: Dictionary, mode: Mode): string {
  return mode === "real"
    ? t.scenarios.keyFiguresHintReal
    : t.scenarios.keyFiguresHint;
}

/** One chart row per year with each scenario's metric under the lens, keyed s0, s1, …
 *  A null metric (LTV on no value, ADR 0133) stays null: a gap, not 0. */
export function mergeCompareMetric(
  results: CompareResult[],
  mode: Mode,
  pick: (y: ProjectionYear) => Decimal | null,
): Record<string, number | null>[] {
  return rowsOf(at(results, 0), mode).map((y, t) => {
    const row: Record<string, number | null> = {
      year: y.year,
      calendarYear: y.calendarYear,
    };
    results.forEach((r, i) => {
      const v = pick(at(rowsOf(r, mode), t));
      row[`s${i}`] = v === null ? null : toNumber(v);
    });
    return row;
  });
}
