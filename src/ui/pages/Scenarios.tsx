// What-if scenarios (SPEC §7): create/edit/duplicate/delete named assumption overrides,
// one-click stress presets, and a 2–3-way side-by-side compare (net worth, net cash flow,
// LTV). Scenarios never mutate portfolio data — the engine re-runs over overridden
// assumptions (+ a transient value-crash portfolio) via useScenarioComparison. The page's
// state and actions are useScenariosPage's; this renders them.
import { PageFrame } from "../components/PageFrame";
import { Button } from "../components/Button";
import { EmptyState } from "../components/layout";
import { FolderOpen, Plus } from "lucide-react";
import { useT } from "../hooks/useT";
import { useScenariosPage } from "../hooks/useScenariosPage";
import { ScenarioCompareView } from "./ScenarioCompare";
import { ScenarioForm } from "./ScenarioForm";
import { PresetBar, ScenarioListPanel } from "./ScenariosPanels";
import { PortfolioStateNotice } from "../components/PortfolioStateNotice";
import { portfolioState } from "../model/portfolioState";
import "../styles/scenarios.css";

export function Scenarios() {
  const t = useT();
  const page = useScenariosPage();
  const { assumptions, portfolio, editing } = page;

  if (!assumptions) {
    return (
      <PageFrame title={t.scenarios.title} showLens={false}>
        <EmptyState title={t.common.noPortfolioTitle} icon={FolderOpen}>
          {t.common.noPortfolioBody}
        </EmptyState>
      </PageFrame>
    );
  }

  const state = portfolio ? portfolioState(portfolio) : null;
  return (
    <PageFrame
      title={t.scenarios.title}
      subtitle={t.scenarios.subtitle}
      // With nothing to compare there is no lens to switch (ADR 0155).
      showLens={!state || state.kind === "ready"}
      actions={
        <Button variant="primary" icon={Plus} onClick={page.openNew}>
          {t.scenarios.addScenario}
        </Button>
      }
    >
      {editing && (
        <ScenarioForm
          assumptions={assumptions}
          scenario={editing === "new" ? null : editing}
          onCancel={page.closeForm}
          onSubmit={page.submit}
        />
      )}

      <ScenarioListPanel
        list={page.list}
        actions={page.actions}
        presets={{
          ...page.presets,
          bar: (
            <PresetBar baseDate={assumptions.baseDate} {...page.presetBar} />
          ),
        }}
      />

      {/* No property, or none active: the saved scenarios stay editable, but there is
          nothing to compare (ADR 0155). */}
      {state && state.kind !== "ready" ? (
        <PortfolioStateNotice state={state} />
      ) : (
        <ScenarioCompareView
          selected={page.selected}
          reachText={page.reachText}
        />
      )}
    </PageFrame>
  );
}
