// What-if scenarios (SPEC §7): create/edit/duplicate/delete named assumption overrides,
// one-click stress presets, and a 2–3-way side-by-side compare (net worth, net cash flow,
// LTV). Scenarios never mutate portfolio data — the engine re-runs over overridden
// assumptions (+ a transient value-crash portfolio) via useScenarioComparison.
import { useEffect, useState } from "react";
import { usePortfolioStore } from "../../state/portfolioStore";
import { MAX_COMPARE, useUiStore } from "../../state/uiStore";
import { AppShell } from "../components/AppShell";
import { Button, EmptyState, Toast } from "../components/primitives";
import { FolderOpen } from "lucide-react";
import type { Scenario, ScenarioOverrides } from "../../engine";
import { useT } from "../hooks/useT";
import { rateShockNote } from "../model/rateShockReach";
import { baseScenario, findByName } from "../model/scenarios";
import { CompareView } from "./ScenarioCompare";
import { ScenarioForm } from "./ScenarioForm";
import { StressPresetsPanel, ScenarioListPanel } from "./ScenariosPanels";
import { useToast } from "../hooks/useToast";

export function Scenarios() {
  const t = useT();
  const assumptions = usePortfolioStore((s) => s.assumptions);
  const portfolio = usePortfolioStore((s) => s.portfolio);
  const scenarios = usePortfolioStore((s) => s.scenarios);
  const unreadable = usePortfolioStore((s) => s.unreadableScenarios);
  const addScenario = usePortfolioStore((s) => s.addScenario);
  const saveScenario = usePortfolioStore((s) => s.saveScenario);
  const duplicateScenario = usePortfolioStore((s) => s.duplicateScenario);
  const removeScenario = usePortfolioStore((s) => s.removeScenario);

  // Compare selection (saved-scenario ids, capped at MAX_COMPARE), the Base toggle and
  // the crash-preset timing live in uiStore for the session (ADR 0101). Base is shown
  // first when on.
  const selectedIds = useUiStore((s) => s.compareIds);
  const baseOn = useUiStore((s) => s.compareBase);
  const crashAtYear = useUiStore((s) => s.crashAtYear);
  const toggle = useUiStore((s) => s.toggleCompare);
  const tick = useUiStore((s) => s.tickCompare);
  const pruneCompare = useUiStore((s) => s.pruneCompare);
  const toggleBase = useUiStore((s) => s.toggleCompareBase);
  const setCrashAtYear = useUiStore((s) => s.setCrashAtYear);
  // The presets panel opens collapsed once a scenario is saved. The default is decided
  // when the page opens, so saving the first preset does not close it under the
  // pointer; a manual Show / Hide wins for the session (ADR 0106).
  const [autoPresetsOpen] = useState(() => scenarios.length === 0);
  const presetsOpen = useUiStore((s) => s.presetsOpen) ?? autoPresetsOpen;
  const setPresetsOpen = useUiStore((s) => s.setPresetsOpen);
  const [editing, setEditing] = useState<Scenario | "new" | null>(null);
  // One in-flight mutation at a time: disables the action buttons and surfaces a
  // success toast (errors already surface via the global banner).
  const [busy, setBusy] = useState(false);
  const { toast, showToast } = useToast();

  // A deleted (or restored-away) scenario leaves the compare selection.
  useEffect(
    () => pruneCompare(scenarios.map((s) => s.id)),
    [scenarios, pruneCompare],
  );

  async function run<R extends { ok: boolean }>(
    action: () => Promise<R>,
    successMsg?: string,
  ): Promise<R> {
    setBusy(true);
    const res = await action();
    setBusy(false);
    if (res.ok && successMsg) showToast(successMsg);
    return res;
  }

  if (!assumptions) {
    return (
      <AppShell title={t.scenarios.title} showLens={false}>
        <EmptyState title={t.common.noPortfolioTitle} icon={FolderOpen}>
          {t.common.noPortfolioBody}
        </EmptyState>
      </AppShell>
    );
  }

  const base = baseScenario(t);
  const selected: Scenario[] = [
    ...(baseOn ? [base] : []),
    ...scenarios.filter((s) => selectedIds.includes(s.id)),
  ];

  /** Which loans a saved scenario's rate shock hits (ADR 0100). */
  function reachText(id: string): string | undefined {
    const s = scenarios.find((x) => x.id === id);
    return s && rateShockNote(s, portfolio, assumptions, t);
  }

  async function addPreset(name: string, overrides: ScenarioOverrides) {
    // A preset that is already saved creates no second row (ADR 0093).
    const existing = findByName(scenarios, name);
    if (existing) {
      tick(existing.id);
      showToast(t.scenarios.alreadySaved(name));
      return;
    }
    const id = crypto.randomUUID();
    const res = await run(() => addScenario({ id, name, overrides }));
    if (!res.ok) return;
    showToast(
      tick(id)
        ? t.scenarios.addedScenario(name)
        : t.scenarios.addedCompareFull(name, MAX_COMPARE),
    );
  }

  async function duplicate(s: Scenario) {
    const id = crypto.randomUUID();
    const res = await run(() => duplicateScenario(s.id, id));
    if (!res.ok) return;
    showToast(
      tick(id)
        ? t.scenarios.duplicatedScenario(s.name)
        : t.scenarios.duplicatedCompareFull(s.name, MAX_COMPARE),
    );
  }

  return (
    <AppShell
      title={t.scenarios.title}
      subtitle={t.scenarios.subtitle}
      actions={
        <Button variant="primary" onClick={() => setEditing("new")}>
          {t.scenarios.newScenario}
        </Button>
      }
    >
      {editing && (
        <ScenarioForm
          assumptions={assumptions}
          scenario={editing === "new" ? null : editing}
          onCancel={() => setEditing(null)}
          onSubmit={async (s) => {
            const isNew = editing === "new";
            const res = isNew ? await addScenario(s) : await saveScenario(s);
            // A refusal stays in the form, on the field it names (ADR 0123).
            if (!res.ok) return res.error;
            setEditing(null);
            if (isNew && !tick(s.id))
              showToast(t.scenarios.addedCompareFull(s.name, MAX_COMPARE));
            return undefined;
          }}
        />
      )}

      <StressPresetsPanel
        open={presetsOpen}
        onToggleOpen={() => setPresetsOpen(!presetsOpen)}
        busy={busy}
        baseDate={assumptions.baseDate}
        crashAtYear={crashAtYear}
        onCrashAtYearChange={setCrashAtYear}
        onAddPreset={addPreset}
      />

      <ScenarioListPanel
        scenarios={scenarios}
        unreadable={unreadable}
        baseOn={baseOn}
        onToggleBase={toggleBase}
        selectedIds={selectedIds}
        maxCompare={MAX_COMPARE}
        onToggle={toggle}
        busy={busy}
        onEdit={setEditing}
        onDuplicate={duplicate}
        onDelete={(s) =>
          run(() => removeScenario(s.id), t.scenarios.deletedScenario(s.name))
        }
        reachText={reachText}
      />

      <CompareView selected={selected} reachText={reachText} />
      {toast && <Toast message={toast} />}
    </AppShell>
  );
}
