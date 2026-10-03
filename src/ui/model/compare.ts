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
}

const pct = (d: Decimal | null) => (d ? fmtPct(d) : "—");

/** Key-figure rows. Net worth shows both lenses; the multiple, CAGR, cumulative cash
 *  flow and IRR follow the lens (ADR 0087). */
export function compareKpiRows(t: Dictionary, mode: Mode): CompareKpiRow[] {
  const s = t.scenarios;
  const real = mode === "real";
  return [
    {
      label: s.kpiNetWorthNominal,
      fmt: (r) => fmtCzkM(r.kpis.netWorthNominal),
    },
    { label: s.kpiNetWorthReal, fmt: (r) => fmtCzkM(r.kpis.netWorthReal) },
    {
      label: s.kpiNetWorthMultiple,
      fmt: (r) => fmtMultiple(lensKpis(r.kpis, mode).netWorthMultiple),
    },
    real
      ? { label: s.kpiCagrReal, fmt: (r) => pct(r.kpis.cagrReal) }
      : { label: s.kpiCagrNominal, fmt: (r) => pct(r.kpis.cagrNominal) },
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
  const rowsOf = (r: CompareResult) =>
    mode === "real" ? r.realProjection : r.projection;
  return rowsOf(at(results, 0)).map((y, t) => {
    const row: Record<string, number> = {
      year: y.year,
      calendarYear: y.calendarYear,
    };
    results.forEach((r, i) => {
      row[`s${i}`] = toNumber(pick(at(rowsOf(r), t)));
    });
    return row;
  });
}
