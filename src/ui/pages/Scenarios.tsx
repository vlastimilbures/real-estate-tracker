// What-if scenarios (SPEC §7): create/edit/duplicate/delete named assumption overrides,
// one-click stress presets, and a 2–3-way side-by-side compare (net worth, net cash flow,
// LTV). Scenarios never mutate portfolio data — the engine re-runs over overridden
// assumptions (+ a transient value-crash portfolio) via useScenarioComparison.
import { useState } from "react";
import { usePortfolioStore } from "../../state/portfolioStore";
import { AppShell } from "../components/AppShell";
import { Button, EmptyState, Toast } from "../components/primitives";
import { FolderOpen } from "lucide-react";
import type { Scenario, ScenarioOverrides } from "../../engine";
import { useT } from "../hooks/useT";
import { baseScenario } from "../model/scenarios";
import { CompareView } from "./ScenarioCompare";
import { ScenarioForm } from "./ScenarioForm";
import { StressPresetsPanel, ScenarioListPanel } from "./ScenariosPanels";
import { useToast } from "../hooks/useToast";

const MAX_COMPARE = 3; // saved scenarios; Base is always available alongside

export function Scenarios() {
  const t = useT();
  const assumptions = usePortfolioStore((s) => s.assumptions);
  const scenarios = usePortfolioStore((s) => s.scenarios);
  const addScenario = usePortfolioStore((s) => s.addScenario);
  const saveScenario = usePortfolioStore((s) => s.saveScenario);
  const duplicateScenario = usePortfolioStore((s) => s.duplicateScenario);
  const removeScenario = usePortfolioStore((s) => s.removeScenario);

  // Compare selection (saved-scenario ids, capped at MAX_COMPARE). Base is toggled
  // separately and shown first when on.
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [baseOn, setBaseOn] = useState(true);
  const [editing, setEditing] = useState<Scenario | "new" | null>(null);
  const [crashAtYear, setCrashAtYear] = useState(0); // timing for the price-crash presets
  // One in-flight mutation at a time: disables the action buttons and surfaces a
  // success toast (errors already surface via the global banner).
  const [busy, setBusy] = useState(false);
  const { toast, showToast } = useToast();

  async function run(
    action: () => Promise<{ ok: boolean }>,
    successMsg: string,
  ) {
    setBusy(true);
    const res = await action();
    setBusy(false);
    if (res.ok) showToast(successMsg);
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

  const base = baseScenario(assumptions, t);
  const selected: Scenario[] = [
    ...(baseOn ? [base] : []),
    ...scenarios.filter((s) => selectedIds.includes(s.id)),
  ];

  function toggle(id: string) {
    setSelectedIds((ids) =>
      ids.includes(id)
        ? ids.filter((x) => x !== id)
        : ids.length >= MAX_COMPARE
          ? ids
          : [...ids, id],
    );
  }

  function addPreset(name: string, overrides: ScenarioOverrides) {
    return run(
      () =>
        addScenario({
          id: crypto.randomUUID(),
          name,
          overrides,
          createdAt: new Date(),
        }),
      t.scenarios.addedScenario(name),
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
            const res =
              editing === "new" ? await addScenario(s) : await saveScenario(s);
            if (res.ok) setEditing(null);
          }}
        />
      )}

      <StressPresetsPanel
        busy={busy}
        baseDate={assumptions.baseDate}
        crashAtYear={crashAtYear}
        onCrashAtYearChange={setCrashAtYear}
        onAddPreset={addPreset}
      />

      <ScenarioListPanel
        scenarios={scenarios}
        baseOn={baseOn}
        onToggleBase={() => setBaseOn((v) => !v)}
        selectedIds={selectedIds}
        maxCompare={MAX_COMPARE}
        onToggle={toggle}
        busy={busy}
        onEdit={setEditing}
        onDuplicate={(s) =>
          run(
            () => duplicateScenario(s.id),
            t.scenarios.duplicatedScenario(s.name),
          )
        }
        onDelete={(s) =>
          run(() => removeScenario(s.id), t.scenarios.deletedScenario(s.name))
        }
      />

      <CompareView selected={selected} />
      {toast && <Toast message={toast} />}
    </AppShell>
  );
}
