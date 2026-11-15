import { useEffect } from "react";
import { flushSync } from "react-dom";
import { useEngine } from "../../state/useEngine";
import { useUiStore } from "../../state/uiStore";
import { usePortfolioStore } from "../../state/portfolioStore";
import { AppShell } from "../components/AppShell";
import { PropertySelect } from "../components/PropertySelect";
import { AsOfPicker } from "../components/AsOfPicker";
import { Button, EmptyState } from "../components/primitives";
import { AlertTriangle, FolderOpen, Plus, Upload } from "lucide-react";
import { toChartRows, toEquityChangeRows } from "../model/chartData";
import { projectionSeries } from "../model/projection";
import { lensKpis } from "../model/lensKpis";
import { lensWord } from "../model/tableContext";
import {
  tilesForAsOf,
  asOfView,
  asOfHint,
  horizonEndYear,
  dashboardSubtitle,
  prunedFilter,
} from "../model/dashboard";
import {
  KpiStrip,
  ProjectionHero,
  MoreCharts,
  KpiListPanel,
} from "./DashboardPanels";
import { FinancingPanel } from "./DashboardFinancing";
import { DATA_CHECK_ID, DataCheckPanel } from "./DashboardDataCheck";
import { dashboardDataCheck } from "../model/dataCheck";
import { focusSection } from "../components/focusSection";
import { cashInvestedTotal } from "../model/acquisition";
import { resetMarkers } from "../model/financing";
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
      <h2 id="getting-started">{t.sample.gettingStartedTitle}</h2>
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
  // Store the pruned filter, so a deactivated property's id cannot come back with it
  // (ADR 0180 §7). Only once the portfolio is loaded: before, every id looks inactive.
  const pruned = fullPortfolio
    ? prunedFilter(dashboardPropertyIds, activeIds)
    : null;
  useEffect(() => {
    if (pruned) setDashboardPropertyIds(pruned);
  }, [pruned, setDashboardPropertyIds]);
  // The date the tiles, picker and subtitle are for, clamped to the window (ADR 0150).
  const view = useAsOf();
  const engine = useEngine(effectiveIds, view?.date ?? null);
  useRenderTiming("dashboard", engine);
  const navigate = useUiStore((s) => s.navigate);
  const openProperty = useUiStore((s) => s.openProperty);
  const openSettings = useUiStore((s) => s.openSettings);
  const setDataCheckOpen = useUiStore((s) => s.setDataCheckOpen);

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
  // Upcoming fixation ends of the filtered properties, on the hero chart (ADR 0210).
  const markers = resetMarkers(
    engine.financing.resets,
    rows,
    assumptions.baseDate,
    new Map(engine.portfolio.properties.map((p) => [p.id, p.name])),
  );
  const eqChange = toEquityChangeRows(series);
  const { isToday } = view;
  const basis = asOfView(assumptions.baseDate, snapshot.asOf, isToday);
  // The KPI strip: for the current snapshot this is the effective-dated engine
  // snapshot under the chosen lens; in a projection year it is that year of `series`
  // (the rows the charts plot), so the cards and the per-year charts agree.
  const s = tilesForAsOf(snapshot, series, basis, mode, assumptions);
  const lens = lensKpis(kpis, mode);
  const horizon = lens.netWorth;
  const irr = lens.leveredIrr;

  const modeWord = lensWord(t, mode);
  // A filter that keeps every active property filters nothing (ADR 0155).
  const filterActive =
    effectiveIds.length > 0 && effectiveIds.length < allProperties.length;
  const subtitle = dashboardSubtitle(
    t,
    filterActive,
    effectiveIds.length,
    allProperties.length,
    isToday,
    s.asOf,
  );

  const check = dashboardDataCheck(
    engine.portfolio,
    snapshot.asOf,
    assumptions.baseDate,
    assumptions.horizonYears,
  );
  const toReview = check.attention.length;

  return (
    <AppShell
      title={t.dashboard.title}
      subtitle={subtitle}
      pageClass="dashboard"
    >
      <SampleBanner />
      <div className="filter-bar">
        {allProperties.length > 1 && (
          <PropertySelect
            mode="multi"
            options={allProperties.map((p) => ({
              value: p.id,
              label: p.name,
            }))}
            allLabel={t.common.all}
            selected={effectiveIds}
            onChange={setDashboardPropertyIds}
          />
        )}
        <AsOfPicker
          value={asOf}
          onChange={setAsOf}
          bounds={view.bounds}
          hint={asOfHint(t, basis, assumptions.baseDate)}
          lead={
            // Warnings stay in view although the Data check is last (ADR 0206 §2); on
            // the hint's row, so the chips and the picker keep their place (ADR 0198).
            toReview > 0 && (
              <Button
                size="sm"
                variant="ghost"
                icon={AlertTriangle}
                onClick={() => {
                  // Open first, so the scroll lands on the open panel (a collapsed one
                  // last on the page cannot scroll to the top).
                  flushSync(() => setDataCheckOpen(true));
                  focusSection(DATA_CHECK_ID);
                }}
              >
                {t.dataCheck.toReview(toReview)}
              </Button>
            )
          }
        />
      </div>

      <KpiStrip
        s={s}
        basis={basis}
        mode={mode}
        isToday={isToday}
        horizon={horizon}
        horizonYears={assumptions.horizonYears}
        horizonEndYear={horizonEndYear(series)}
        netWorthMultiple={lens.netWorthMultiple}
        modeWord={modeWord}
        irr={irr}
      />

      {/* The projection first (ADR 0202 §1). */}
      <ProjectionHero
        mode={mode}
        rows={rows}
        markers={markers}
        horizonYears={assumptions.horizonYears}
      />

      <FinancingPanel
        fx={engine.financing}
        portfolio={engine.portfolio}
        kpis={kpis}
        mode={mode}
        horizonYears={assumptions.horizonYears}
        onOpenProperty={openProperty}
      />

      <MoreCharts
        mode={mode}
        rows={rows}
        eqChange={eqChange}
        horizonYears={assumptions.horizonYears}
      />

      <KpiListPanel
        s={s}
        basis={basis}
        kpis={kpis}
        mode={mode}
        horizonYears={assumptions.horizonYears}
        cashInvested={cashInvestedTotal(engine.portfolio.properties)}
      />

      {/* Last on the page (ADR 0206 §1); the filter bar links to it. */}
      <DataCheckPanel
        check={check}
        asOf={snapshot.asOf}
        resetRate={assumptions.postFixationResetRatePa}
        onFix={(id, fix) =>
          fix === "assumptions" || id === null
            ? openSettings("assumptions")
            : openProperty(id, fix)
        }
      />
    </AppShell>
  );
}
