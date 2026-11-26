// The Assumptions form's state (ADR 0095, 0221): the draft, its errors and the save. The
// Settings page holds it, so the form and the Save/Discard in the top bar read one draft.
// The fields, the draft's text and the check are ui/model/assumptionsForm's.
import { useEffect, useMemo, useState } from "react";
import {
  usePortfolioStore,
  type MutationResult,
} from "../../state/portfolioStore";
import { isDirty } from "../model/dirty";
import type { Assumptions } from "../../engine";
import { type Dictionary } from "../../i18n";
import {
  assumptionSpecs,
  assumptionsDraft,
  checkAssumptionsDraft,
} from "../model/assumptionsForm";
import { useT } from "./useT";
import { fieldsIn, formWriteErrors } from "../model/writeError";
import { useToast } from "./useToast";
import { useFormSubmit } from "./useFormSubmit";
import { useLeaveGuard } from "./useLeaveGuard";

export type AssumptionsForm = ReturnType<typeof useAssumptionsForm>;

/** A failed save that is not an input rule has no place in this form, so it goes to the
 *  banner (ADR 0261), even when the draft was dropped while it ran. */
async function bannerUnlessInput(
  save: Promise<MutationResult>,
): Promise<MutationResult> {
  const result = await save;
  if (!result.ok && result.error.kind !== "input")
    usePortfolioStore.getState().showError(result.error);
  return result;
}

/**
 * The save. On failure a broken rule marks its field, or is listed in the error summary
 * when it names no field shown here (ADR 0141), until the next edit; any other failure
 * shows in the PageFrame banner, put there by bannerUnlessInput (ADR 0261). The page owns
 * focus after a save (ADR 0248 §4). The success toast shows only when the write landed.
 */
function useAssumptionsSave(
  t: Dictionary,
  fieldNames: string[],
  outcome: { saved: () => void; failed: (summaryLists: boolean) => void },
) {
  const saveAssumptions = usePortfolioStore((s) => s.saveAssumptions);
  return useFormSubmit({
    run: async (next: Assumptions) => {
      const result = await bannerUnlessInput(saveAssumptions(next));
      return result.ok ? undefined : result.error;
    },
    mapErrors: (failure) => {
      const split = formWriteErrors(t, failure, fieldsIn(fieldNames));
      return {
        fieldErrors: split.fieldErrors,
        formError: failure.kind === "input" ? split.formError : null,
      };
    },
    onSaved: outcome.saved,
    onFailed: ({ fieldErrors, formError }) =>
      outcome.failed(Object.keys(fieldErrors).length > 0 || Boolean(formError)),
    refocusOnFailure: false,
  });
}

/** Leaving the tab (the unsaved-changes guard lets that happen only when the user
 *  discards) drops the draft during the render that sees it, as unmounting did, and then
 *  detaches a save still running, so its outcome is not written into the form shown
 *  later. */
function useDropOnLeave(active: boolean, drop: () => void, detach: () => void) {
  const [wasActive, setWasActive] = useState(active);
  if (wasActive !== active) {
    setWasActive(active);
    if (!active) drop();
  }
  useEffect(() => {
    if (!active) detach();
  }, [active, detach]);
}

/** @param active whether the Assumptions tab shows. */
export function useAssumptionsForm(active: boolean) {
  const t = useT();
  const { drivers, defaults } = assumptionSpecs(t);
  const specs = [...drivers, ...defaults];
  const assumptions = usePortfolioStore((s) => s.assumptions);
  const initial = useMemo(
    () => (assumptions ? assumptionsDraft(assumptions) : null),
    [assumptions],
  );
  const [draft, setDraft] = useState<Record<string, string> | null>(null);
  const { showToast } = useToast();
  // A failed save keeps the input and says so until the next edit (ADR 0095).
  const [failed, setFailed] = useState(false);
  // Bumped on a failed save so the error summary takes focus once it renders.
  const [summaryFocus, setSummaryFocus] = useState(0);
  const submitted = useAssumptionsSave(
    t,
    specs.map((s) => s.name),
    {
      // Saved: show the stored values again, so the form is no longer "unsaved".
      saved: () => {
        setDraft(null);
        setFailed(false);
        showToast(t.assumptions.saved);
      },
      // Keep the input, and focus the summary when it lists anything.
      failed: (summaryLists) => {
        setFailed(true);
        if (summaryLists) setSummaryFocus((n) => n + 1);
      },
    },
  );
  const { errors, clearFields, clearAll, detach } = submitted;
  const clearDraft = () => {
    setDraft(null);
    clearAll();
    setFailed(false);
  };
  useDropOnLeave(active, clearDraft, detach);

  // No draft shows the stored values, so a change to them shows at once; a draft is kept
  // as it is and compared with them.
  const current = draft ?? initial;
  // Unsaved edits hold back navigation away from this tab.
  const unsaved = Boolean(initial && current && isDirty(initial, current));
  useLeaveGuard("assumptions", unsaved);

  return {
    drivers,
    defaults,
    /** The draft shown, or null before the portfolio loads. */
    current,
    errors,
    formError: submitted.formError,
    invalid: specs.filter((s) => errors[s.name]),
    unsaved,
    saving: submitted.busy,
    failed,
    summaryFocus,
    stateText: failed
      ? t.common.saveFailedKept
      : unsaved
        ? t.common.unsavedChanges
        : t.common.allChangesSaved,
    set: (name: string, v: string) => {
      if (!current) return;
      setDraft({ ...current, [name]: v });
      clearFields([name]);
      setFailed(false);
    },
    save: () => {
      if (current)
        void submitted.submit(() => checkAssumptionsDraft(t, current));
    },
    // A save that was running when the draft was dropped must not write its outcome into
    // the form shown later: discarding detaches it.
    discard: () => {
      detach();
      clearDraft();
    },
  };
}
