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

const pct = (d: Decimal | null) => (d ? fmtPct(d) : "—");

const rowsOf = (r: CompareResult, mode: Mode) =>
  mode === "real" ? r.realProjection : r.projection;

/** Equity in projection year 0 (CPI₀ = 1, so it is the same in both lenses). */
const startingEquity = (r: CompareResult) => at(r.projection, 0).equity;

/** A crash at Today lowers starting equity, so the returns are rebased (ADR 0089). */
const startsDifferently = (r: CompareResult, base: CompareResult) =>
  !startingEquity(r).eq(startingEquity(base));

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

interface KpiRowSpec extends CompareKpiRow {
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

  const rows: KpiRowSpec[] = [
    {
      label: s.kpiStartingEquity,
      fmt: (r) => fmtCzkM(at(rowsOf(r, mode), 0).equity),
      delta: decimalDelta((r) => at(rowsOf(r, mode), 0).equity, fmtCzkM),
    },
    ...(base
      ? [
          {
            label: s.kpiNetWorthDeltaVsBase,
            fmt: (r: CompareResult) => {
              if (r.id === base.id) return "—";
              return signed(netWorth(r).minus(netWorth(base)), fmtCzkM);
            },
          },
        ]
      : []),
    {
      label: s.kpiNetWorthNominal,
      fmt: (r) => fmtCzkM(r.kpis.netWorthNominal),
      delta: decimalDelta((r) => r.kpis.netWorthNominal, fmtCzkM),
    },
    {
      label: s.kpiNetWorthReal,
      fmt: (r) => fmtCzkM(r.kpis.netWorthReal),
      delta: decimalDelta((r) => r.kpis.netWorthReal, fmtCzkM),
    },
    {
      label: s.kpiNetWorthMultiple,
      fmt: (r) => fmtMultiple(lensKpis(r.kpis, mode).netWorthMultiple),
      mark: rebased,
      delta: decimalDelta(
        (r) => lensKpis(r.kpis, mode).netWorthMultiple,
        fmtMultiple,
      ),
    },
    real
      ? {
          label: s.kpiCagrReal,
          fmt: (r) => pct(r.kpis.cagrReal),
          mark: rebased,
          delta: decimalDelta((r) => r.kpis.cagrReal, pp),
        }
      : {
          label: s.kpiCagrNominal,
          fmt: (r) => pct(r.kpis.cagrNominal),
          mark: rebased,
          delta: decimalDelta((r) => r.kpis.cagrNominal, pp),
        },
    {
      label: s.kpiCumulativeNetCf,
      fmt: (r) => fmtCzkM(lensKpis(r.kpis, mode).cumulativeNetCashFlow),
      delta: decimalDelta(
        (r) => lensKpis(r.kpis, mode).cumulativeNetCashFlow,
        fmtCzkM,
      ),
    },
    {
      label: real ? s.kpiLeveredIrrReal : s.kpiLeveredIrrNominal,
      fmt: (r) => {
        const irr = leveredIrr(r.kpis, mode);
        return irr.rate ? fmtPct(irr.rate) : t.common.notApplicable;
      },
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
      fmt: (r) => r.kpis.firstCashFlowPositiveYear?.toString() ?? "—",
      delta: yearDelta((r) => r.kpis.firstCashFlowPositiveYear),
    },
    {
      label: s.kpiDebtFreeYear,
      fmt: (r) => r.kpis.debtFreeYear?.toString() ?? "—",
      delta: yearDelta((r) => r.kpis.debtFreeYear),
    },
  ];
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

/** One chart row per year with each scenario's metric under the lens, keyed s0, s1, … */
export function mergeCompareMetric(
  results: CompareResult[],
  mode: Mode,
  pick: (y: ProjectionYear) => Decimal,
): Record<string, number>[] {
  return rowsOf(at(results, 0), mode).map((y, t) => {
    const row: Record<string, number> = {
      year: y.year,
      calendarYear: y.calendarYear,
    };
    results.forEach((r, i) => {
      row[`s${i}`] = toNumber(pick(at(rowsOf(r, mode), t)));
    });
    return row;
  });
}
