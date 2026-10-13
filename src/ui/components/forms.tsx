// Form components — a generic record form; field controls live in ./fields, loan-event
// rows in ./LoanEventRows and parsing/formatting helpers in ../model/formParse.
import { useEffect, useId, useState, type ReactNode } from "react";
import {
  collectValues,
  type FieldSpec,
  type LeadRow,
  type ParsedValues,
} from "../model/formParse";
import { formRules } from "../model/formParsers";
import { draftRowOf, listKind } from "../model/loanEventRows";
import { Button } from "./primitives";
import { DateInput } from "./DateInput";
import { Field, TextInput } from "./fields";
import { useT } from "../hooks/useT";
import { formWriteErrors } from "../model/writeError";
import { toWriteError, type WriteError } from "../../state/writeError";
import { useUiStore } from "../../state/uiStore";
import { isDirty } from "../model/dirty";
import {
  LoanEventRows,
  type LeadBinding,
  type ListNotes,
} from "./LoanEventRows";

/** Field-row buttons keyed by field name (see RecordForm's `fieldActions`). */
export type FieldActions<S extends readonly FieldSpec[]> = Partial<
  Record<
    S[number]["name"],
    (draft: Record<string, string>) => {
      label: string;
      title?: string | undefined;
      patch?: Record<string, string> | undefined;
    } | null
  >
>;

/** Controlled record form: renders specs, validates on submit, and hands back values
 *  typed by the specs (declare them inline so their names and kinds stay literal). */
export function RecordForm<const S extends readonly FieldSpec[]>({
  specs,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  computeHint,
  fieldActions,
  validate,
  header,
  hiddenFields,
  listNotes,
  unsavedKey,
}: {
  specs: S;
  initial: Record<string, string>;
  submitLabel: string;
  /** May be async; while the returned promise is pending the submit/cancel buttons
   *  disable and the submit label shows "Saving…", so a mutation can't be double-fired.
   *  Resolve to a WriteError to keep the form open with the failure shown: on the
   *  field it names, else above the buttons (UX-047). */
  onSubmit: (
    values: ParsedValues<S>,
  ) => void | WriteError | Promise<void | WriteError>;
  onCancel?: (() => void) | undefined;
  /** Live hint computed from the current draft (e.g. a suggested instalment). */
  computeHint?: ((draft: Record<string, string>) => string | null) | undefined;
  /** Cross-field validation run after per-field parsing succeeds; returns a map of
   *  field name → error message (empty when valid). Lets the form reject e.g. a
   *  development loan missing its required term, with the error shown inline. */
  validate?:
    | ((
        values: ParsedValues<S>,
        draft: Record<string, string>,
      ) => Record<string, string>)
    | undefined;
  /** Optional draft-derived buttons keyed by field name; the button renders inline
   *  to the right of that field and patches the draft on click. A null return hides
   *  the button entirely; an omitted `patch` renders it disabled (not yet computable). */
  fieldActions?: FieldActions<S> | undefined;
  /** Rendered above the fields with the draft and a way to patch it, e.g. a mode
   *  switch kept in the draft under a key that is not a spec (ADR 0098). */
  header?:
    | ((
        draft: Record<string, string>,
        patch: (p: Record<string, string>) => void,
      ) => ReactNode)
    | undefined;
  /** Names of the specs not shown for this draft. They still parse on submit, so a
   *  hidden field should be blank. */
  hiddenFields?:
    ((draft: Record<string, string>) => readonly string[]) | undefined;
  /** Soft warnings and a footer for a row list, from the draft (ADR 0167). */
  listNotes?:
    | ((name: string, draft: Record<string, string>) => ListNotes | null)
    | undefined;
  /** The leave-guard key for this form's unsaved edits, when the parent guards its own
   *  actions with it (ADR 0142); else the form makes its own. */
  unsavedKey?: string | undefined;
}) {
  const t = useT();
  const [draft, setDraft] = useState<Record<string, string>>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Leave guard (UX-073): while the draft differs from the values the form opened with
  // (or last saved), navigation asks first. Each form registers under its own key.
  const ownKey = useId();
  const formKey = unsavedKey ?? ownKey;
  const [baseline, setBaseline] = useState(initial);
  const setUnsavedChanges = useUiStore((s) => s.setUnsavedChanges);
  const fieldsOf = (r: Record<string, string>) =>
    Object.fromEntries(specs.map((spec) => [spec.name, r[spec.name] ?? ""]));
  const unsaved = isDirty(fieldsOf(baseline), fieldsOf(draft));
  useEffect(() => {
    setUnsavedChanges(formKey, unsaved);
  }, [formKey, unsaved, setUnsavedChanges]);
  useEffect(
    () => () => setUnsavedChanges(formKey, false),
    [formKey, setUnsavedChanges],
  );

  /** Edit fields; their errors go with the edit (ADR 0141, as the property form). */
  function patch(p: Record<string, string>) {
    setDraft((d) => ({ ...d, ...p }));
    setErrors((e) => {
      const copy = { ...e };
      for (const name of Object.keys(p)) delete copy[name];
      return copy;
    });
  }
  const edit = (name: string, v: string) => patch({ [name]: v });
  /** A row list's fixed first row, bound to its field in the draft (ADR 0167). */
  const leadOf = (lead: LeadRow | undefined): LeadBinding | undefined =>
    lead && {
      ...lead,
      value: draft[lead.field] ?? "",
      date: draft[lead.dateField] ?? "",
      error: errors[lead.field],
      onChange: (v) => edit(lead.field, v),
    };

  async function submit() {
    const { values, errors: errs } = collectValues(specs, draft, formRules(t));
    // Cross-field rules only run once every field parses, so messages point at the
    // real problem (not a noisy parse error) and `values` is fully populated.
    if (Object.keys(errs).length === 0 && validate) {
      Object.assign(errs, validate(values, draft));
    }
    setErrors(errs);
    setFormError(null);
    if (Object.keys(errs).length > 0) return;
    setBusy(true);
    try {
      // A throwing onSubmit (sync or async) is shown like a returned failure (DR-090).
      let failure: void | WriteError;
      try {
        failure = await onSubmit(values);
      } catch (e) {
        failure = toWriteError(e);
      }
      if (!failure) setBaseline(draft);
      else {
        const split = formWriteErrors(
          t,
          failure,
          specs.map((s) => s.name),
          (field, index) =>
            listKind(specs.find((s) => s.name === field)?.kind)
              ? draftRowOf(draft[field] ?? "", index)
              : null,
        );
        setErrors(split.fieldErrors);
        setFormError(split.formError);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="record-form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy) void submit();
      }}
    >
      {header?.(draft, patch)}
      <div className="form-grid">
        {specs.map((spec) => {
          if (hiddenFields?.(draft).includes(spec.name)) return null;
          if (listKind(spec.kind))
            return (
              <div key={spec.name} className="form-wide">
                <LoanEventRows
                  kind={spec.kind}
                  name={spec.name}
                  label={spec.label}
                  help={spec.help}
                  value={draft[spec.name] ?? ""}
                  errors={errors}
                  notes={listNotes?.(spec.name, draft)}
                  lead={leadOf(spec.lead)}
                  onChange={(v) => {
                    setDraft((d) => ({ ...d, [spec.name]: v }));
                    // Row errors are keyed by position: an edit can move rows, so the
                    // list's errors go until the next save.
                    setErrors((e) =>
                      Object.fromEntries(
                        Object.entries(e).filter(
                          ([k]) =>
                            k !== spec.name && !k.startsWith(`${spec.name}.`),
                        ),
                      ),
                    );
                  }}
                />
              </div>
            );
          const action =
            fieldActions?.[spec.name as S[number]["name"]]?.(draft) ?? null;
          const input =
            spec.kind === "date" ? (
              <DateInput
                value={draft[spec.name] ?? ""}
                onChange={(v) => edit(spec.name, v)}
              />
            ) : (
              <TextInput
                value={draft[spec.name] ?? ""}
                onChange={(v) => edit(spec.name, v)}
                suffix={spec.suffix}
                inputMode="decimal"
                placeholder={
                  spec.optional ? t.forms.defaultPlaceholder : undefined
                }
              />
            );
          return (
            <Field
              key={spec.name}
              label={spec.label}
              required={!spec.optional}
              error={errors[spec.name]}
              help={spec.help}
            >
              {action ? (
                <div className="field-row">
                  {input}
                  <Button
                    type="button"
                    size="sm"
                    title={action.title ?? action.label}
                    disabled={!action.patch}
                    onClick={() => action.patch && patch(action.patch)}
                  >
                    {action.label}
                  </Button>
                </div>
              ) : (
                input
              )}
            </Field>
          );
        })}
      </div>
      {computeHint &&
        (() => {
          const h = computeHint(draft);
          return h ? <p className="form-hint">{h}</p> : null;
        })()}
      {formError && (
        <p className="error-text" role="alert">
          {formError}
        </p>
      )}
      <div className="form-actions">
        {unsaved && (
          <span className="form-state">{t.common.unsavedChanges}</span>
        )}
        {onCancel && (
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={busy}
          >
            {t.common.cancel}
          </Button>
        )}
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? t.common.saving : submitLabel}
        </Button>
      </div>
    </form>
  );
}
