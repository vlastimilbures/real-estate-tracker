import { flushSync } from "react-dom";
import { useEngine } from "../../state/useEngine";
import { useUiStore } from "../../state/uiStore";
import { PageFrame } from "../components/PageFrame";
import { PropertySelect } from "../components/PropertySelect";
import { AsOfPicker } from "../components/AsOfPicker";
import { Button, EmptyState } from "../components/primitives";
import { FolderOpen, Plus, Upload } from "lucide-react";
import { dashboardView } from "../model/dashboardView";
import { KpiStrip, ProjectionCharts, KpiListPanel } from "./DashboardPanels";
import { FinancingPanel } from "./DashboardFinancing";
import { DATA_CHECK_ID, DataCheckPanel } from "./DashboardDataCheck";
import { reviewPill } from "../model/dataCheck";
import { focusSection } from "../focus";
import { useT } from "../hooks/useT";
import { useAsOf } from "../hooks/useAsOf";
import { useDashboardFilter } from "../hooks/useDashboardFilter";
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
  const asOf = useUiStore((s) => s.asOf);
  const setAsOf = useUiStore((s) => s.setAsOf);
  // The chips list every active property; the engine runs over the kept ones. The hook
  // writes a pruned filter back (ADR 0180 §7).
  const filter = useDashboardFilter();
  // The date the tiles, picker and subtitle are for, clamped to the window (ADR 0150).
  const view = useAsOf();
  const engine = useEngine(filter.effectiveIds, view?.date ?? null);
  useRenderTiming("dashboard", engine);
  const navigate = useUiStore((s) => s.navigate);
  const openProperty = useUiStore((s) => s.openProperty);
  const openSettings = useUiStore((s) => s.openSettings);
  const setDataCheckOpen = useUiStore((s) => s.setDataCheckOpen);

  // Every property deactivated: say so, and point at Properties (ADR 0155).
  const state = filter.portfolio ? portfolioState(filter.portfolio) : null;
  if (state?.kind === "allInactive") {
    return (
      <PageFrame title={t.dashboard.title} showLens={false}>
        <SampleBanner />
        <PortfolioStateNotice state={state} />
      </PageFrame>
    );
  }

  if (!engine || !view || filter.properties.length === 0) {
    return (
      <PageFrame title={t.dashboard.title} showLens={false}>
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
      </PageFrame>
    );
  }

  const v = dashboardView(engine, mode, view, t, filter);
  const { assumptions } = engine;

  return (
    <PageFrame
      title={t.dashboard.title}
      subtitle={v.subtitle}
      pageClass="dashboard"
      attention={
        // Findings stay in view although the Data check is last (ADR 0218 §1).
        reviewPill(t, v.toReview, () => {
          // Open first, so the scroll lands on the open panel (a collapsed one last on
          // the page cannot scroll to the top).
          flushSync(() => setDataCheckOpen(true));
          focusSection(DATA_CHECK_ID);
        })
      }
    >
      <SampleBanner />
      <div className="filter-bar">
        {filter.properties.length > 1 && (
          <PropertySelect
            mode="multi"
            options={filter.properties.map((p) => ({
              value: p.id,
              label: p.name,
            }))}
            allLabel={t.common.all}
            selected={filter.effectiveIds}
            onChange={filter.setIds}
          />
        )}
        <AsOfPicker
          value={asOf}
          onChange={setAsOf}
          bounds={view.bounds}
          hint={v.pickerHint}
        />
      </div>

      <KpiStrip view={v.strip} />

      {/* The projection first, then Financing (ADR 0218 §3). */}
      <ProjectionCharts view={v.charts} />

      <FinancingPanel
        fx={engine.financing}
        portfolio={engine.portfolio}
        kpis={engine.kpis}
        mode={mode}
        horizonYears={assumptions.horizonYears}
      />

      <KpiListPanel view={v.kpiList} />

      {/* Last on the page (ADR 0206 §1); the filter bar links to it. */}
      <DataCheckPanel
        check={v.check}
        asOf={engine.snapshot.asOf}
        resetRate={assumptions.postFixationResetRatePa}
        onFix={(id, fix) =>
          fix === "assumptions" || id === null
            ? openSettings("assumptions")
            : openProperty(id, fix)
        }
      />
    </PageFrame>
  );
}
