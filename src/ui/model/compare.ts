// Pure presentation model for Scenario compare: picks each scenario's nominal or real
// projection (the engine deflates with the scenario's own CPI, D-23) and the key-figure
// rows for the lens (UX-055, DR-093). Moved out of ScenarioCompare.tsx.
import { fmtCzkM, fmtMultiple, fmtPct } from "../../lib/format";
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

/** Key-figure rows. Starting equity and Δ net worth vs Base lead (ADR 0089); net worth
 *  shows both lenses; the multiple, CAGR, cumulative cash flow and IRR follow the lens
 *  (ADR 0087). The Δ row needs Base in the comparison. */
export function compareKpiRows(
  t: Dictionary,
  mode: Mode,
  base?: CompareResult,
): CompareKpiRow[] {
  const s = t.scenarios;
  const real = mode === "real";
  const netWorth = (r: CompareResult) =>
    real ? r.kpis.netWorthReal : r.kpis.netWorthNominal;
  const rebased = (r: CompareResult) =>
    base !== undefined && startsDifferently(r, base);
  return [
    {
      label: s.kpiStartingEquity,
      fmt: (r) => fmtCzkM(at(rowsOf(r, mode), 0).equity),
    },
    ...(base
      ? [
          {
            label: s.kpiNetWorthDeltaVsBase,
            fmt: (r: CompareResult) => {
              if (r.id === base.id) return "—";
              const d = netWorth(r).minus(netWorth(base));
              return d.gt(0) ? `+${fmtCzkM(d)}` : fmtCzkM(d);
            },
          },
        ]
      : []),
    {
      label: s.kpiNetWorthNominal,
      fmt: (r) => fmtCzkM(r.kpis.netWorthNominal),
    },
    { label: s.kpiNetWorthReal, fmt: (r) => fmtCzkM(r.kpis.netWorthReal) },
    {
      label: s.kpiNetWorthMultiple,
      fmt: (r) => fmtMultiple(lensKpis(r.kpis, mode).netWorthMultiple),
      mark: rebased,
    },
    real
      ? {
          label: s.kpiCagrReal,
          fmt: (r) => pct(r.kpis.cagrReal),
          mark: rebased,
        }
      : {
          label: s.kpiCagrNominal,
          fmt: (r) => pct(r.kpis.cagrNominal),
          mark: rebased,
        },
    {
      label: s.kpiCumulativeNetCf,
      fmt: (r) => fmtCzkM(lensKpis(r.kpis, mode).cumulativeNetCashFlow),
    },
    {
      label: real ? s.kpiLeveredIrrReal : s.kpiLeveredIrrNominal,
      fmt: (r) => {
        const irr = leveredIrr(r.kpis, mode);
        return irr.rate ? fmtPct(irr.rate) : t.common.notApplicable;
      },
      note: (r) => irrReasonText(t, leveredIrr(r.kpis, mode).reason),
      mark: rebased,
    },
    {
      label: s.kpiFirstCfPositiveYear,
      fmt: (r) => r.kpis.firstCashFlowPositiveYear?.toString() ?? "—",
    },
    {
      label: s.kpiDebtFreeYear,
      fmt: (r) => r.kpis.debtFreeYear?.toString() ?? "—",
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
