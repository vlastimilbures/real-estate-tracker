import { useEngine } from "../../state/useEngine";
import { asOfBounds } from "../model/asOf";
import { useUiStore } from "../../state/uiStore";
import { usePortfolioStore } from "../../state/portfolioStore";
import { AppShell } from "../components/AppShell";
import { PropertySelect } from "../components/PropertySelect";
import { AsOfPicker } from "../components/AsOfPicker";
import { todayUtc } from "../../lib/today";
import { Button, EmptyState } from "../components/primitives";
import { FolderOpen, Plus, Upload } from "lucide-react";
import { toChartRows, toEquityChangeRows } from "../model/chartData";
import { projectionSeries } from "../model/projection";
import { leveredIrr } from "../model/irr";
import { lensKpis } from "../model/lensKpis";
import {
  monthlyFlow,
  netWorthHorizon,
  tilesForAsOf,
  asOfBasis,
  asOfHint,
  horizonEndYear,
  monthlyFlowLabels,
  netCashFlowFoot,
  dashboardSubtitle,
} from "../model/dashboard";
import {
  HeroTiles,
  RiskTiles,
  MonthlyFlowPanel,
  TrajectoryCharts,
  KpiListPanel,
} from "./DashboardPanels";
import { useT } from "../hooks/useT";
import { useRenderTiming } from "../hooks/useRenderTiming";

export function Dashboard() {
  const t = useT();
  const mode = useUiStore((s) => s.mode);
  const dashboardPropertyIds = useUiStore((s) => s.dashboardPropertyIds);
  const setDashboardPropertyIds = useUiStore((s) => s.setDashboardPropertyIds);
  const asOf = useUiStore((s) => s.asOf);
  const setAsOf = useUiStore((s) => s.setAsOf);
  // Full portfolio drives the chip list; the engine runs over the filtered subset.
  const fullPortfolio = usePortfolioStore((s) => s.portfolio);
  // Only active properties get a filter chip. Prune any selected id that points at a
  // now-deactivated property so the dashboard falls back to "All" instead of rendering
  // zeroes for an invisible chip.
  const allProperties = (fullPortfolio?.properties ?? []).filter(
    (p) => p.active !== false,
  );
  const activeIds = new Set(allProperties.map((p) => p.id));
  const effectiveIds = dashboardPropertyIds.filter((id) => activeIds.has(id));
  const engine = useEngine(effectiveIds, asOf);
  useRenderTiming("dashboard", engine);
  const navigate = useUiStore((s) => s.navigate);

  if (!engine || allProperties.length === 0) {
    return (
      <AppShell title={t.dashboard.title} showLens={false}>
        <EmptyState
          title={t.common.noPortfolioTitle}
          icon={FolderOpen}
          action={
            <div className="row">
              <Button
                variant="primary"
                icon={Plus}
                onClick={() => navigate("properties")}
              >
                {t.properties.addProperty}
              </Button>
              <Button icon={Upload} onClick={() => navigate("import")}>
                {t.common.importCsv}
              </Button>
            </div>
          }
        >
          {t.common.noPortfolioBody}
        </EmptyState>
      </AppShell>
    );
  }

  const { snapshot, kpis, projection, assumptions } = engine;
  const series = projectionSeries(projection, mode, assumptions);
  const rows = toChartRows(series);
  const eqChange = toEquityChangeRows(series);
  // Tiles + the flow band: for the current snapshot this is the effective-dated engine
  // snapshot under the chosen lens; for a future as-of date it is sourced from the
  // projection year that date lands on (the same `series` the charts plot), so the cards
  // and the per-year charts agree.
  const s = tilesForAsOf(snapshot, series, mode, assumptions);
  const flow = monthlyFlow(s);
  const horizon = netWorthHorizon(kpis, mode);
  const irr = leveredIrr(kpis, mode);

  const modeWord = mode === "real" ? t.common.realLower : t.common.nominalLower;
  const filterActive = effectiveIds.length > 0;
  const isToday = asOf === null || asOf.getTime() === todayUtc().getTime();
  const basis = asOfBasis(assumptions.baseDate, s.asOf, series, isToday);
  const flowLabels = monthlyFlowLabels(t, basis, assumptions.baseDate, s.asOf);
  const subtitle = dashboardSubtitle(
    t,
    filterActive,
    effectiveIds.length,
    allProperties.length,
    isToday,
    s.asOf,
  );

  return (
    <AppShell title={t.dashboard.title} subtitle={subtitle}>
      <div className="filter-bar">
        {allProperties.length > 1 ? (
          <PropertySelect
            mode="multi"
            options={allProperties.map((p) => ({ value: p.id, label: p.name }))}
            allLabel={t.common.all}
            selected={effectiveIds}
            onChange={setDashboardPropertyIds}
          />
        ) : (
          <span />
        )}
        <AsOfPicker
          value={asOf}
          onChange={setAsOf}
          bounds={asOfBounds(assumptions.baseDate, assumptions.horizonYears)}
          hint={asOfHint(t, basis, assumptions.baseDate)}
        />
      </div>

      <HeroTiles
        s={s}
        mode={mode}
        isToday={isToday}
        horizon={horizon}
        horizonYears={assumptions.horizonYears}
        horizonEndYear={horizonEndYear(series)}
        netWorthMultiple={lensKpis(kpis, mode).netWorthMultiple}
        modeWord={modeWord}
        irr={irr}
      />

      <RiskTiles s={s} cashFlowFoot={netCashFlowFoot(t, basis)} />

      <MonthlyFlowPanel
        flow={flow}
        title={flowLabels.title}
        hint={flowLabels.hint}
      />

      <TrajectoryCharts
        mode={mode}
        rows={rows}
        eqChange={eqChange}
        horizonYears={assumptions.horizonYears}
      />

      <KpiListPanel
        s={s}
        kpis={kpis}
        mode={mode}
        horizon={horizon}
        horizonYears={assumptions.horizonYears}
        irr={irr}
      />
    </AppShell>
  );
}
