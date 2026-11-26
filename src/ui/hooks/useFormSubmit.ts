import { useCallback, useRef, useState } from "react";
import { toWriteError, type WriteError } from "../../state/writeError";
import { useSaveBusy } from "./useSaveBusy";

type FieldErrors = Record<string, string>;

/** A failed save or a refused check, as the form shows it: messages on the fields it
 *  shows, and one line for the rest (ADR 0141, ADR 0261). */
export interface FormFailure {
  fieldErrors: FieldErrors;
  formError: string | null;
}

/** The form's own check of its draft, run before the save. */
export type FormCheck<V> =
  { ok: true; values: V } | { ok: false; errors: FieldErrors };

export interface FormSubmitOptions<V> {
  /** The save. Resolves to a WriteError to keep the form open with the failure shown;
   *  a throw is shown like a returned failure (ADR 0241 §3). */
  run: (values: V) => void | WriteError | Promise<void | WriteError>;
  /** Split a failed save for this form. */
  mapErrors: (failure: WriteError) => FormFailure;
  /** After a save that resolved with no failure. */
  onSaved?: ((values: V) => void) | undefined;
  /** After a refused check (no form-level message) and after a failed save. */
  onFailed?: ((failure: FormFailure) => void) | undefined;
  /** Put focus back on the control that started a failed save (ADR 0246); false where
   *  the page owns focus after a save (Assumptions, ADR 0248 §4). Default true. */
  refocusOnFailure?: boolean | undefined;
}

/**
 * One form's submit state: the busy flag, the field errors and the form-level
 * message, and the step that turns a refused check or a failed save into them. The
 * form-level message goes with the next edit and with each Save (ADR 0262 §1).
 *
 * `submit(check)` returns at once while a save runs; the guard is a ref, so two submits
 * in one tick still save once. The options and `check` used are the ones of the render
 * that submitted. `detach()` makes the running save end its busy flag without writing
 * its outcome (a draft dropped while it ran).
 */
export function useFormSubmit<V>(options: FormSubmitOptions<V>) {
  const { run, mapErrors, onSaved, onFailed } = options;
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const refocus = options.refocusOnFailure ?? true;
  const [busy, setBusy] = useSaveBusy(
    refocus ? errors : {},
    refocus ? formError : null,
  );
  const running = useRef(false);
  const generation = useRef(0);

  const show = (failure: FormFailure) => {
    setErrors(failure.fieldErrors);
    setFormError(failure.formError);
    onFailed?.(failure);
  };

  async function submit(check: () => FormCheck<V>): Promise<void> {
    if (running.current) return;
    const checked = check();
    setErrors(checked.ok ? {} : checked.errors);
    setFormError(null);
    if (!checked.ok) {
      onFailed?.({ fieldErrors: checked.errors, formError: null });
      return;
    }
    running.current = true;
    setBusy(true);
    const started = generation.current;
    try {
      let failure: void | WriteError;
      try {
        failure = await run(checked.values);
      } catch (e) {
        failure = toWriteError(e);
      }
      if (generation.current !== started) return;
      if (failure) show(mapErrors(failure));
      else onSaved?.(checked.values);
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  /** An edit: the edited fields' errors go with it (ADR 0141), and the form-level
   *  message too (ADR 0262 §1). */
  const clearFields = (
    fields: readonly string[] | ((key: string) => boolean),
  ) => {
    const drop =
      typeof fields === "function" ? fields : (k: string) => fields.includes(k);
    setErrors((e) =>
      Object.fromEntries(Object.entries(e).filter(([k]) => !drop(k))),
    );
    setFormError(null);
  };
  /** Drop every error and the message; only sets state, so it may run during render. */
  const clearAll = () => {
    setErrors({});
    setFormError(null);
  };
  const dismissFormError = () => setFormError(null);
  const detach = useCallback(() => {
    generation.current += 1;
  }, []);

  return {
    busy,
    errors,
    formError,
    submit,
    clearFields,
    clearAll,
    dismissFormError,
    detach,
  };
}
