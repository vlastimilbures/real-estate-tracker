// The Dashboard's view: everything the page derives from the engine's output, the
// lens, the as-of date and the filter, so the page only renders. Pure.
import type { PortfolioKPIs, PortfolioSnapshot } from "../../engine";
import type { EngineOutput } from "../../state/engineModel";
import type { Dictionary } from "../../i18n";
import type { Decimal } from "../../lib/money";
import { cashInvestedTotal } from "./acquisition";
import type { ResolvedAsOf } from "./asOf";
import {
  toChartRows,
  toEquityChangeRows,
  type ChartRow,
  type EquityChangeRow,
} from "./chartData";
import {
  asOfHint,
  asOfView,
  dashboardSubtitle,
  horizonEndYear,
  tilesForAsOf,
  type AsOfBasis,
} from "./dashboard";
import { dashboardDataCheck } from "./dataCheck";
import { resetMarkers, type ResetMarker } from "./financing";
import type { Mode } from "./lens";
import { lensKpis, type LensKpis } from "./lensKpis";
import { projectionSeries } from "./projection";
import { lensWord } from "./tableContext";

/** The KPI band (ADR 0200, 0222): as of the chosen date, then at the horizon. */
export interface KpiStripView {
  s: PortfolioSnapshot;
  /** What the tiles are for: current, a projection year or a date (ADR 0088). */
  basis: AsOfBasis;
  mode: Mode;
  isToday: boolean;
  /** Net worth, its multiple and the IRR at the horizon, under the lens. */
  lens: Pick<LensKpis, "netWorth" | "netWorthMultiple" | "leveredIrr">;
  horizonYears: number;
  /** Calendar year of the last projection row (ADR 0088). */
  horizonEndYear: number;
  /** The lens as a lower-case word for the horizon caption. */
  modeWord: string;
}

/** The six projection charts (ADR 0218 §2); the rows carry the lens. */
export interface ProjectionChartsView {
  mode: Mode;
  rows: ChartRow[];
  eqChange: EquityChangeRow[];
  /** Upcoming fixation ends of the filtered properties (ADR 0210). */
  markers?: readonly ResetMarker[] | undefined;
  horizonYears: number;
}

/** The key figures the tiles do not show (ADR 0208). */
export interface KpiListView {
  s: PortfolioSnapshot;
  /** What the as-of figures (yields, monthly flows) are for (ADR 0200 §3). */
  basis: AsOfBasis;
  kpis: PortfolioKPIs;
  lens: Pick<LensKpis, "cagr" | "cumulativeNetCashFlow">;
  mode: Mode;
  horizonYears: number;
  /** Σ own cash, null unless every property has it (ADR 0119 §9). */
  cashInvested: Decimal | null;
}

export interface DashboardView {
  subtitle: string;
  /** The as-of picker's hint, by the same basis as the tiles (ADR 0088). */
  pickerHint: string | null;
  strip: KpiStripView;
  charts: ProjectionChartsView;
  kpiList: KpiListView;
  /** The Data check of the properties in view (ADR 0118). */
  check: ReturnType<typeof dashboardDataCheck>;
  /** Its attention count, also the title pill (ADR 0218 §1). */
  toReview: number;
}

/** The filter as the view needs it (`dashboardFilter`). */
interface FilterSummary {
  filterActive: boolean;
  effectiveIds: readonly string[];
  properties: readonly unknown[];
}

export function dashboardView(
  engine: EngineOutput,
  mode: Mode,
  view: ResolvedAsOf,
  t: Dictionary,
  filter: FilterSummary,
): DashboardView {
  const { snapshot, kpis, projection, assumptions } = engine;
  const { horizonYears, baseDate } = assumptions;
  const series = projectionSeries(projection, mode, assumptions);
  const rows = toChartRows(series);
  const basis = asOfView(baseDate, snapshot.asOf, view.isToday);
  // The KPI strip: for the current snapshot this is the effective-dated engine snapshot
  // under the chosen lens; in a projection year it is that year of `series` (the rows
  // the charts plot), so the cards and the per-year charts agree.
  const s = tilesForAsOf(snapshot, series, basis, mode, assumptions);
  const lens = lensKpis(kpis, mode);
  const check = dashboardDataCheck(engine.portfolio, {
    asOf: snapshot.asOf,
    baseDate,
    horizonYears,
  });
  const subtitle = dashboardSubtitle(t, {
    filterActive: filter.filterActive,
    effectiveCount: filter.effectiveIds.length,
    totalCount: filter.properties.length,
    isToday: view.isToday,
    asOf: s.asOf,
  });
  return {
    subtitle,
    pickerHint: asOfHint(t, basis, baseDate),
    strip: {
      s,
      basis,
      mode,
      isToday: view.isToday,
      lens,
      horizonYears,
      horizonEndYear: horizonEndYear(series),
      modeWord: lensWord(t, mode),
    },
    charts: {
      mode,
      rows,
      eqChange: toEquityChangeRows(series),
      // Upcoming fixation ends of the filtered properties, on the value chart (ADR 0210).
      markers: resetMarkers(
        engine.financing.resets,
        rows,
        new Map(engine.portfolio.properties.map((p) => [p.id, p.name])),
      ),
      horizonYears,
    },
    kpiList: {
      s,
      basis,
      kpis,
      lens,
      mode,
      horizonYears,
      cashInvested: cashInvestedTotal(engine.portfolio.properties),
    },
    check,
    toReview: check.attention.length,
  };
}
