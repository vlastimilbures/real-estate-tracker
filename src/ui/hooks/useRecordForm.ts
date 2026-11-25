// One record form's state (#490): the draft, whether it holds unsaved edits (the leave
// guard), and the Save that parses it and shows a refusal or a failed save. The markup is
// RecordFormView's (../components/forms).
import { useId, useState } from "react";
import {
  collectValues,
  shownFields,
  type FieldSpec,
  type ParsedValues,
} from "../model/formParse";
import { formRules } from "../model/formParsers";
import { draftRowOf, listKind } from "../model/loanEventRows";
import { formWriteErrors } from "../model/writeError";
import { isDirty } from "../model/dirty";
import type { WriteError } from "../../state/writeError";
import { useFormSubmit } from "./useFormSubmit";
import { useLeaveGuard } from "./useLeaveGuard";
import { useT } from "./useT";

type Draft = Record<string, string>;

export interface RecordFormOptions<S extends readonly FieldSpec[]> {
  specs: S;
  initial: Draft;
  /** May be async; while it runs the form is busy, so a mutation can't be double-fired.
   *  Resolve to a WriteError to keep the form open with the failure shown: on the field
   *  it names if shown, else above the buttons (UX-047, ADR 0243). */
  onSubmit: (
    values: ParsedValues<S>,
  ) => void | WriteError | Promise<void | WriteError>;
  /** Names of the specs not shown for this draft. They still parse on submit, so a
   *  hidden field should be blank; a save error on one shows above the buttons. */
  hiddenFields?: ((draft: Draft) => readonly string[]) | undefined;
  /** The leave-guard key for this form's unsaved edits, when the parent guards its own
   *  actions with it (ADR 0142); else the form makes its own. */
  unsavedKey?: string | undefined;
}

/** What a record form renders from. */
export interface RecordFormState {
  draft: Draft;
  /** The specs `hiddenFields` hides for this draft. */
  hidden: readonly string[];
  errors: Record<string, string>;
  formError: string | null;
  busy: boolean;
  unsaved: boolean;
  /** Edit fields; their errors and the form-level message go with the edit. */
  patch: (p: Draft) => void;
  /** Edit a row list; all of its errors go with the edit. */
  editList: (name: string, value: string) => void;
  /** Parse the draft and save it, or show why not; resolves once the save ends. */
  submit: () => Promise<void>;
}

export function useRecordForm<const S extends readonly FieldSpec[]>({
  specs,
  initial,
  onSubmit,
  hiddenFields,
  unsavedKey,
}: RecordFormOptions<S>): RecordFormState {
  const t = useT();
  const [draft, setDraft] = useState<Draft>(initial);
  // Leave guard (UX-073): while the draft differs from the values the form opened with
  // (or last saved), navigation asks first. Each form registers under its own key.
  const ownKey = useId();
  const [baseline, setBaseline] = useState(initial);
  const fieldsOf = (r: Draft) =>
    Object.fromEntries(specs.map((spec) => [spec.name, r[spec.name] ?? ""]));
  const unsaved = isDirty(fieldsOf(baseline), fieldsOf(draft));
  useLeaveGuard(unsavedKey ?? ownKey, unsaved);
  const hidden = hiddenFields?.(draft) ?? [];

  // A failure goes on the field it names if shown, else above the buttons, until the
  // next edit or Save (ADR 0262 §1).
  const { busy, errors, formError, submit, clearFields } = useFormSubmit({
    run: onSubmit,
    mapErrors: (failure) =>
      formWriteErrors(t, failure, shownFields(specs, hidden), (field, index) =>
        listKind(specs.find((s) => s.name === field)?.kind)
          ? draftRowOf(draft[field] ?? "", index)
          : null,
      ),
    onSaved: () => setBaseline(draft),
  });

  /** Edit fields; their errors go with the edit (ADR 0141, as the property form). */
  function patch(p: Draft) {
    setDraft((d) => ({ ...d, ...p }));
    clearFields(Object.keys(p));
  }
  function editList(name: string, value: string) {
    setDraft((d) => ({ ...d, [name]: value }));
    // Row errors are keyed by position: an edit can move rows, so the list's errors go
    // until the next save.
    clearFields((k) => k === name || k.startsWith(`${name}.`));
  }
  /** Parse the draft; every error is on a field the parse names. */
  function check() {
    const { values, errors: errs } = collectValues(specs, draft, formRules(t));
    return Object.keys(errs).length > 0
      ? { ok: false as const, errors: errs }
      : { ok: true as const, values };
  }

  return {
    draft,
    hidden,
    errors,
    formError,
    busy,
    unsaved,
    patch,
    editList,
    // A throwing onSubmit (sync or async) is shown like a returned failure (DR-090).
    submit: () => submit(check),
  };
}
