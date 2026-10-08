import { useEngine } from "../../state/useEngine";
import { asOfBounds } from "../model/asOf";
import { useUiStore } from "../../state/uiStore";
import { usePortfolioStore } from "../../state/portfolioStore";
import { AppShell } from "../components/AppShell";
import { PropertySelect } from "../components/PropertySelect";
import { AsOfPicker } from "../components/AsOfPicker";
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
  asOfView,
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
import { FinancingPanel } from "./DashboardFinancing";
import { DataCheckPanel } from "./DashboardDataCheck";
import { cashInvestedTotal } from "../model/acquisition";
import { useT } from "../hooks/useT";
import { useAsOf } from "../hooks/useAsOf";
import { useRenderTiming } from "../hooks/useRenderTiming";
import { SampleBanner } from "../components/SampleBanner";
import { PortfolioStateNotice } from "../components/PortfolioStateNotice";
import { portfolioState } from "../model/portfolioState";

/** First steps for an empty portfolio, each linking to its page; no wizard (ADR 0094). */
function GettingStarted() {
  const t = useT();
  const openSettings = useUiStore((s) => s.openSettings);
  const requestNewProperty = useUiStore((s) => s.requestNewProperty);
  const navigate = useUiStore((s) => s.navigate);
  const steps = [
    { label: t.sample.stepAssumptions, go: () => openSettings("assumptions") },
    { label: t.sample.stepAddProperty, go: requestNewProperty },
    { label: t.sample.stepDetails, go: () => navigate("properties") },
    { label: t.sample.stepReview, go: () => navigate("projections") },
    { label: t.sample.stepBackup, go: () => openSettings("backup") },
  ];
  return (
    <section className="getting-started" aria-labelledby="getting-started">
      <h3 id="getting-started">{t.sample.gettingStartedTitle}</h3>
      <ol>
        {steps.map((s) => (
          <li key={s.label}>
            <Button size="sm" variant="ghost" onClick={s.go}>
              {s.label}
            </Button>
          </li>
        ))}
      </ol>
    </section>
  );
}

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
  // The date the tiles, picker and subtitle are for, clamped to the window (ADR 0150).
  const view = useAsOf();
  const engine = useEngine(effectiveIds, view?.date ?? null);
  useRenderTiming("dashboard", engine);
  const navigate = useUiStore((s) => s.navigate);
  const openProperty = useUiStore((s) => s.openProperty);
  const openSettings = useUiStore((s) => s.openSettings);

  // Every property deactivated: say so, and point at Properties (ADR 0155).
  const state = fullPortfolio ? portfolioState(fullPortfolio) : null;
  if (state?.kind === "allInactive") {
    return (
      <AppShell title={t.dashboard.title} showLens={false}>
        <SampleBanner />
        <PortfolioStateNotice state={state} />
      </AppShell>
    );
  }

  if (!engine || !view || allProperties.length === 0) {
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
        <GettingStarted />
      </AppShell>
    );
  }

  const { snapshot, kpis, projection, assumptions } = engine;
  const series = projectionSeries(projection, mode, assumptions);
  const rows = toChartRows(series);
  const eqChange = toEquityChangeRows(series);
  const { isToday } = view;
  const basis = asOfView(assumptions.baseDate, snapshot.asOf, series, isToday);
  // Tiles + the flow band: for the current snapshot this is the effective-dated engine
  // snapshot under the chosen lens; in a projection year it is that year of `series`
  // (the rows the charts plot), so the cards and the per-year charts agree.
  const s = tilesForAsOf(snapshot, series, basis, mode, assumptions);
  const flow = monthlyFlow(s);
  const horizon = netWorthHorizon(kpis, mode);
  const irr = leveredIrr(kpis, mode);

  const modeWord = mode === "real" ? t.common.realLower : t.common.nominalLower;
  // A filter that keeps every active property filters nothing (ADR 0155).
  const filterActive =
    effectiveIds.length > 0 && effectiveIds.length < allProperties.length;
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
      <SampleBanner />
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

      <FinancingPanel
        fx={engine.financing}
        portfolio={engine.portfolio}
        kpis={kpis}
        mode={mode}
        horizonYears={assumptions.horizonYears}
        onOpenProperty={openProperty}
      />

      <DataCheckPanel
        portfolio={engine.portfolio}
        asOf={snapshot.asOf}
        baseDate={assumptions.baseDate}
        resetRate={assumptions.postFixationResetRatePa}
        horizonYears={assumptions.horizonYears}
        onFix={(id, fix) =>
          fix === "assumptions" || id === null
            ? openSettings("assumptions")
            : openProperty(id, fix)
        }
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
        cashInvested={cashInvestedTotal(engine.portfolio.properties)}
      />
    </AppShell>
  );
}
