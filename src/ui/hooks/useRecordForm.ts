// One record form's state (#490): the draft, whether it holds unsaved edits (the leave
// guard), and the Save that parses it and shows a refusal or a failed save. The draft is
// the text fields plus, for a form with `lists` (the mortgage form), its row lists. The
// markup is RecordFormView's (../components/forms).
import { useId, useState } from "react";
import {
  collectValues,
  formRules,
  isFieldSpec,
  shownFields,
  type FormLists,
  type FormSpec,
  type ParsedValues,
} from "../model/formParse";
import { fieldsIn, formWriteErrors } from "../model/writeError";
import { isDirty } from "../model/dirty";
import type { WriteError } from "../../state/writeError";
import { useFormSubmit } from "./useFormSubmit";
import { useLeaveGuard } from "./useLeaveGuard";
import { useT } from "./useT";

type Draft = Record<string, string>;

export interface RecordFormOptions<S extends readonly FormSpec[], L = NoLists> {
  specs: S;
  initial: Draft;
  /** The row lists and their model, for a form that has any. */
  lists?: { initial: L; model: FormLists<L> } | undefined;
  /** May be async; while it runs the form is busy, so a mutation can't be double-fired.
   *  Resolve to a WriteError to keep the form open with the failure shown: on the field
   *  it names if shown, else above the buttons (UX-047, ADR 0243). */
  onSubmit: (
    values: ParsedValues<S>,
  ) => void | WriteError | Promise<void | WriteError>;
  /** Names of the specs not shown for this draft. They still parse on submit, so a
   *  hidden field should be blank; a save error on one shows above the buttons. */
  hiddenFields?: ((draft: Draft, lists: L) => readonly string[]) | undefined;
  /** The leave-guard key for this form's unsaved edits, when the parent guards its own
   *  actions with it (ADR 0142); else the form makes its own. */
  unsavedKey?: string | undefined;
}

type NoLists = Record<never, never>;

const NO_LISTS: FormLists<NoLists> = {
  texts: () => ({}),
  parse: () => ({ values: {}, errors: {} }),
  rowOf: () => null,
};

/** What a record form's markup renders from. */
export interface RecordFormState {
  /** The text fields (and any key that is not a spec, such as the loan type). */
  draft: Draft;
  /** The specs `hiddenFields` hides for this draft. */
  hidden: readonly string[];
  errors: Record<string, string>;
  formError: string | null;
  busy: boolean;
  unsaved: boolean;
  /** Edit fields; their errors and the form-level message go with the edit. */
  patch: (p: Draft) => void;
  /** Parse the draft and save it, or show why not; resolves once the save ends. */
  submit: () => Promise<void>;
}

/** A form with row lists: the lists, and the edits that change them. */
export interface RecordFormWithLists<L> extends RecordFormState {
  lists: L;
  /** Edit fields and lists in one edit; the errors of every name edited go with it. */
  patch: (p: Draft, lists?: Partial<L>) => void;
  /** Edit a row list; all of its errors go with the edit (row errors are keyed by
   *  position, and an edit can move rows). */
  editList: <K extends keyof L & string>(name: K, rows: L[K]) => void;
}

export function useRecordForm<const S extends readonly FormSpec[], L = NoLists>(
  options: RecordFormOptions<S, L>,
): RecordFormWithLists<L> {
  const { specs, initial, onSubmit, hiddenFields, unsavedKey } = options;
  const model = (options.lists?.model ?? NO_LISTS) as FormLists<L>;
  const t = useT();
  const [draft, setDraft] = useState(() => ({
    fields: initial,
    lists: options.lists?.initial ?? ({} as L),
  }));
  // Leave guard (UX-073): while the draft differs from the values the form opened with
  // (or last saved), navigation asks first. Each form registers under its own key.
  const ownKey = useId();
  const [baseline, setBaseline] = useState(draft);
  const textOf = (d: typeof draft) => ({
    ...Object.fromEntries(specs.map((s) => [s.name, d.fields[s.name] ?? ""])),
    ...model.texts(d.lists),
  });
  const unsaved = isDirty(textOf(baseline), textOf(draft));
  useLeaveGuard(unsavedKey ?? ownKey, unsaved);
  const hidden = hiddenFields?.(draft.fields, draft.lists) ?? [];

  // A failure goes on the field it names if shown, else above the buttons, until the
  // next edit or Save (ADR 0262 §1).
  const { busy, errors, formError, submit, clearFields } = useFormSubmit({
    run: onSubmit,
    mapErrors: (failure) =>
      formWriteErrors(
        t,
        failure,
        // The shown fields by name, a list item on its draft row.
        fieldsIn(shownFields(specs, hidden), (field, index) =>
          model.rowOf(draft.lists, field, index),
        ),
      ),
    onSaved: () => setBaseline(draft),
  });

  function patch(p: Draft, lists: Partial<L> = {}) {
    setDraft((d) => ({
      fields: { ...d.fields, ...p },
      lists: { ...d.lists, ...lists },
    }));
    clearFields([...Object.keys(p), ...Object.keys(lists)]);
  }
  function editList<K extends keyof L & string>(name: K, rows: L[K]) {
    setDraft((d) => ({ ...d, lists: { ...d.lists, [name]: rows } }));
    clearFields((k) => k === name || k.startsWith(`${name}.`));
  }
  /** Parse the draft: the text fields by their specs, the lists by their model (a row
   *  list's spec is not text, so it never reaches collectValues). */
  function check() {
    const fields = specs.filter(isFieldSpec);
    const parsed = collectValues(fields, draft.fields, formRules(t));
    const lists = model.parse(draft.lists, t);
    const errs = { ...parsed.errors, ...lists.errors };
    if (Object.keys(errs).length > 0)
      return { ok: false as const, errors: errs };
    // Each field spec's value came from collectValues and each list's from its model, so
    // the record has the ParsedValues<S> shape.
    const values = { ...parsed.values, ...lists.values } as ParsedValues<S>;
    return { ok: true as const, values };
  }

  return {
    draft: draft.fields,
    lists: draft.lists,
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
