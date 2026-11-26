// The Scenarios page's state and actions (SPEC §7): the saved scenarios, the compare
// selection, the presets drawer and the writes, so the page only renders.
import { useEffect, useMemo, useState } from "react";
import {
  usePortfolioStore,
  type MutationResult,
} from "../../state/portfolioStore";
import { MAX_COMPARE, useUiStore } from "../../state/uiStore";
import type { WriteError } from "../../state/writeError";
import type { Scenario, ScenarioOverrides } from "../../engine";
import { rateShockNote } from "../model/rateShockReach";
import { baseScenario, findSaved } from "../model/scenarios";
import { inConfirmRow } from "../components/panelFocus";
import { KEEP, useBusyFocus, type BusyFocusTarget } from "./useBusyFocus";
import { useToast } from "./useToast";
import { useT } from "./useT";
import { newId } from "../../lib/newId";

/** A preset or Duplicate gets focus back after any outcome (ADR 0248 §2); a delete's
 *  confirm row places focus itself (ADR 0173, ADR 0248 §1). */
const pressedUnlessConfirm: BusyFocusTarget = (el) =>
  inConfirmRow(el) ? KEEP : el;

/** What the scenario list shows. */
export interface ScenarioListView {
  scenarios: Scenario[];
  baseOn: boolean;
  selectedIds: string[];
  busy: boolean;
  /** Which loans the scenario's rate shock hits (ADR 0100). */
  reachText?: ((id: string) => string | undefined) | undefined;
}

/** What the scenario list's controls do. */
export interface ScenarioListActions {
  toggleBase: () => void;
  toggle: (id: string) => void;
  edit: (s: Scenario) => void;
  duplicate: (s: Scenario) => void;
  remove: (s: Scenario) => Promise<MutationResult>;
}

/** The compare selection (saved-scenario ids, capped at MAX_COMPARE), the Base toggle
 *  and the crash-preset timing: uiStore, for the session (ADR 0101). */
function useCompareSelection() {
  const selectedIds = useUiStore((s) => s.compareIds);
  const baseOn = useUiStore((s) => s.compareBase);
  const crashAtYear = useUiStore((s) => s.crashAtYear);
  const toggle = useUiStore((s) => s.toggleCompare);
  const tick = useUiStore((s) => s.tickCompare);
  const pruneCompare = useUiStore((s) => s.pruneCompare);
  const toggleBase = useUiStore((s) => s.toggleCompareBase);
  const setCrashAtYear = useUiStore((s) => s.setCrashAtYear);
  return {
    selectedIds,
    baseOn,
    crashAtYear,
    toggle,
    tick,
    pruneCompare,
    toggleBase,
    setCrashAtYear,
  };
}

/** The presets (the Scenarios panel's "Add from preset", ADR 0220) start closed once a
 *  scenario is saved. The default is decided when the page opens, so saving the first
 *  preset does not close them under the pointer; a manual open or close wins for the
 *  session (ADR 0106). */
function usePresetsDrawer(scenarios: Scenario[]) {
  const [autoOpen] = useState(() => scenarios.length === 0);
  const open = useUiStore((s) => s.presetsOpen) ?? autoOpen;
  const setOpen = useUiStore((s) => s.setPresetsOpen);
  return { open, onToggle: () => setOpen(!open) };
}

/** Which loans each saved scenario's rate shock hits (ADR 0100). Each note builds a block
 *  schedule per loan, so it is built once per data change. */
function useReachText(scenarios: Scenario[]) {
  const t = useT();
  const portfolio = usePortfolioStore((s) => s.portfolio);
  const assumptions = usePortfolioStore((s) => s.assumptions);
  const reach = useMemo(
    () =>
      new Map(
        scenarios.map((s) => [
          s.id,
          rateShockNote(s, portfolio, assumptions, t),
        ]),
      ),
    [scenarios, portfolio, assumptions, t],
  );
  return (id: string) => reach.get(id);
}

/** One in-flight mutation at a time: `busy` disables the action buttons, and a success
 *  shows `successMsg` as a toast. */
function useBusyRun() {
  const [busy, setBusy] = useBusyFocus(pressedUnlessConfirm);
  const { showToast } = useToast();
  async function run(
    action: () => Promise<MutationResult>,
    successMsg?: string,
  ): Promise<MutationResult> {
    setBusy(true);
    let res: MutationResult;
    try {
      res = await action();
    } finally {
      setBusy(false);
    }
    if (res.ok && successMsg) showToast(successMsg);
    return res;
  }
  return { busy, run, showToast };
}

/** The page's writes. A failure shows where the action was started: a preset and
 *  Duplicate have no place of their own, so they put theirs in the banner (ADR 0261). */
function useScenarioWrites(
  scenarios: Scenario[],
  tick: (id: string) => boolean,
) {
  const t = useT();
  const addScenario = usePortfolioStore((s) => s.addScenario);
  const saveScenario = usePortfolioStore((s) => s.saveScenario);
  const duplicateScenario = usePortfolioStore((s) => s.duplicateScenario);
  const removeScenario = usePortfolioStore((s) => s.removeScenario);
  const showError = usePortfolioStore((s) => s.showError);
  const { busy, run, showToast } = useBusyRun();

  async function addPreset(name: string, overrides: ScenarioOverrides) {
    // A preset that is already saved, under any name, creates no second row (ADR 0093,
    // ADR 0191 §3); the toast names the saved one.
    const existing = findSaved(scenarios, overrides);
    if (existing) {
      tick(existing.id);
      showToast(t.scenarios.alreadySaved(existing.name));
      return;
    }
    const id = newId();
    const res = await run(() => addScenario({ id, name, overrides }));
    if (!res.ok) return showError(res.error);
    showToast(
      tick(id)
        ? t.scenarios.addedScenario(name)
        : t.scenarios.addedCompareFull(name, MAX_COMPARE),
    );
  }

  async function duplicate(s: Scenario) {
    const id = newId();
    const res = await run(() =>
      duplicateScenario(s.id, id, t.scenarios.copyName(s.name)),
    );
    if (!res.ok) return showError(res.error);
    showToast(
      tick(id)
        ? t.scenarios.duplicatedScenario(s.name)
        : t.scenarios.duplicatedCompareFull(s.name, MAX_COMPARE),
    );
  }

  /** The form's save: a refusal stays in the form, on the field it names (ADR 0123);
   *  otherwise `close` closes it. */
  async function submit(s: Scenario, isNew: boolean, close: () => void) {
    const res = isNew ? await addScenario(s) : await saveScenario(s);
    if (!res.ok) return res.error;
    close();
    if (isNew && !tick(s.id))
      showToast(t.scenarios.addedCompareFull(s.name, MAX_COMPARE));
    return undefined;
  }

  const remove = (s: Scenario) =>
    run(() => removeScenario(s.id), t.scenarios.deletedScenario(s.name));
  return { busy, addPreset, duplicate, submit, remove };
}

/** The Scenarios page: what it shows and what its controls do. */
export function useScenariosPage() {
  const t = useT();
  const assumptions = usePortfolioStore((s) => s.assumptions);
  const portfolio = usePortfolioStore((s) => s.portfolio);
  const scenarios = usePortfolioStore((s) => s.scenarios);
  const sel = useCompareSelection();
  const presets = usePresetsDrawer(scenarios);
  const [editing, setEditing] = useState<Scenario | "new" | null>(null);
  const writes = useScenarioWrites(scenarios, sel.tick);
  const reachText = useReachText(scenarios);
  const { pruneCompare } = sel;

  // A deleted (or restored-away) scenario leaves the compare selection.
  useEffect(
    () => pruneCompare(scenarios.map((s) => s.id)),
    [scenarios, pruneCompare],
  );

  const list: ScenarioListView = {
    scenarios,
    baseOn: sel.baseOn,
    selectedIds: sel.selectedIds,
    busy: writes.busy,
    reachText,
  };
  const actions: ScenarioListActions = {
    toggleBase: sel.toggleBase,
    toggle: sel.toggle,
    edit: setEditing,
    duplicate: (s) => void writes.duplicate(s),
    remove: writes.remove,
  };
  // Base is shown first when on.
  const selected: Scenario[] = [
    ...(sel.baseOn ? [baseScenario(t)] : []),
    ...scenarios.filter((s) => sel.selectedIds.includes(s.id)),
  ];
  return {
    assumptions,
    portfolio,
    list,
    actions,
    selected,
    reachText,
    presets,
    presetBar: {
      busy: writes.busy,
      crashAtYear: sel.crashAtYear,
      onCrashAtYearChange: sel.setCrashAtYear,
      onAddPreset: writes.addPreset,
    },
    editing,
    closeForm: () => setEditing(null),
    openNew: () => setEditing("new"),
    /** Save the form's scenario; the form closes unless the write was refused. */
    submit: (s: Scenario): Promise<WriteError | undefined> =>
      writes.submit(s, editing === "new", () => setEditing(null)),
  };
}
