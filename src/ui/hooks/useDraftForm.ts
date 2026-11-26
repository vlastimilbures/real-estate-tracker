// One form's draft and its save: the draft, the values it opened with (or last
// saved), whether it holds unsaved edits (the leave guard, ADR 0262 §2), and the
// Save's busy flag, errors and messages (useFormSubmit). The record forms (useRecordForm)
// and the property dialog build on it.
import { useCallback, useId, useState } from "react";
import type { WriteError } from "../../state/writeError";
import {
  useFormSubmit,
  type FormFailure,
  type FormSubmitOptions,
} from "./useFormSubmit";
import { useLeaveGuard } from "./useLeaveGuard";
import { isDirty } from "../model/dirty";

export interface DraftFormOptions<D, V> {
  /** The draft the form opens with, read when it mounts. */
  initial: () => D;
  /** The part of a draft the unsaved check compares; all of it by default. */
  unsavedOf?: ((draft: D) => object) | undefined;
  /** The leave-guard key, when the parent guards its own actions with it (ADR 0142);
   *  else the form makes its own. */
  unsavedKey?: string | undefined;
  run: FormSubmitOptions<V>["run"];
  /** Split a failed save for the form, given the draft that was saved. */
  mapErrors: (failure: WriteError, draft: D) => FormFailure;
  /** Whether a save makes the saved draft the new baseline (a form that stays open). */
  rebaseOnSave?: boolean | undefined;
  onSaved?: (() => void) | undefined;
  onFailed?: FormSubmitOptions<V>["onFailed"];
}

export function useDraftForm<D extends object, V>(
  options: DraftFormOptions<D, V>,
) {
  const { unsavedOf = (d: D) => d } = options;
  const [draft, setDraft] = useState(options.initial);
  // While the draft differs from the values the form opened with (or last saved),
  // navigation asks first. Each form registers under its own key.
  const ownKey = useId();
  const [baseline, setBaseline] = useState(draft);
  const unsaved = isDirty(unsavedOf(baseline), unsavedOf(draft));
  useLeaveGuard(options.unsavedKey ?? ownKey, unsaved);

  // A failure goes on the field it names if shown, else above the buttons, until the
  // next edit or Save (ADR 0262 §1).
  const save = useFormSubmit<V>({
    run: options.run,
    mapErrors: (failure) => options.mapErrors(failure, draft),
    onSaved: () => {
      if (options.rebaseOnSave) setBaseline(draft);
      options.onSaved?.();
    },
    onFailed: options.onFailed,
  });

  /** An edit: the next draft, and the error keys that go with it (ADR 0141), with the
   *  form-level message (ADR 0262 §1). */
  function edit(
    next: (d: D) => D,
    cleared: Parameters<typeof save.clearFields>[0],
  ) {
    setDraft(next);
    save.clearFields(cleared);
  }
  /** Values read in after the form opened, not input: the baseline takes them too.
   *  Stable, so an effect that reads them in can depend on it. */
  const load = useCallback((next: (d: D) => D) => {
    setDraft(next);
    setBaseline(next);
  }, []);

  return { ...save, draft, unsaved, edit, load };
}
