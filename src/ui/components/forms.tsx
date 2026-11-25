// Form components — a generic record form: its state is useRecordForm's, field controls
// live in ./fields, loan-event rows in ./LoanEventRows and parsing/formatting helpers in
// ../model/formParse.
import type { ReactNode } from "react";
import type { FieldSpec, LeadRow } from "../model/formParse";
import { listKind, type EventListKind } from "../model/loanEventRows";
import { Button } from "./primitives";
import { DateInput } from "./DateInput";
import { Field, TextInput } from "./fields";
import { useT } from "../hooks/useT";
import {
  useRecordForm,
  type RecordFormOptions,
  type RecordFormState,
} from "../hooks/useRecordForm";
import {
  LoanEventRows,
  type LeadBinding,
  type ListNotes,
} from "./LoanEventRows";

type Draft = Record<string, string>;

/** One field-row button, from the draft (see RecordForm's `fieldActions`). */
type FieldAction = (draft: Draft) => {
  label: string;
  title?: string | undefined;
  patch?: Draft | undefined;
} | null;

/** Field-row buttons keyed by field name (see RecordForm's `fieldActions`). */
export type FieldActions<S extends readonly FieldSpec[]> = Partial<
  Record<S[number]["name"], FieldAction>
>;

/** What the record form shows around its fields (all optional). */
interface RecordFormExtras<S extends readonly FieldSpec[]> {
  /** Live hint computed from the current draft (e.g. a suggested instalment). */
  computeHint?: ((draft: Draft) => string | null) | undefined;
  /** Optional draft-derived buttons keyed by field name; the button renders inline
   *  to the right of that field and patches the draft on click. A null return hides
   *  the button entirely; an omitted `patch` renders it disabled (not yet computable). */
  fieldActions?: FieldActions<S> | undefined;
  /** Rendered above the fields with the draft and a way to patch it, e.g. a mode
   *  switch kept in the draft under a key that is not a spec (ADR 0098). */
  header?: ((draft: Draft, patch: (p: Draft) => void) => ReactNode) | undefined;
  /** Soft warnings and a footer for a row list, from the draft (ADR 0167). */
  listNotes?: ((name: string, draft: Draft) => ListNotes | null) | undefined;
}

interface RecordFormViewProps<
  S extends readonly FieldSpec[],
> extends RecordFormExtras<S> {
  form: RecordFormState;
  specs: S;
  submitLabel: string;
  onCancel?: (() => void) | undefined;
}

/** Controlled record form: renders specs, validates on submit, and hands back values
 *  typed by the specs (declare them inline so their names and kinds stay literal). */
export function RecordForm<const S extends readonly FieldSpec[]>({
  specs,
  initial,
  onSubmit,
  hiddenFields,
  unsavedKey,
  ...view
}: RecordFormOptions<S> &
  RecordFormExtras<S> & {
    submitLabel: string;
    onCancel?: (() => void) | undefined;
  }) {
  const form = useRecordForm({
    specs,
    initial,
    onSubmit,
    hiddenFields,
    unsavedKey,
  });
  return <RecordFormView form={form} specs={specs} {...view} />;
}

/** The record form's markup, from its state (useRecordForm). */
function RecordFormView<S extends readonly FieldSpec[]>({
  form,
  specs,
  submitLabel,
  onCancel,
  computeHint,
  fieldActions,
  header,
  listNotes,
}: RecordFormViewProps<S>) {
  const { draft } = form;
  const hint = computeHint?.(draft) ?? null;
  return (
    <form
      className="record-form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void form.submit();
      }}
    >
      {header?.(draft, form.patch)}
      <div className="form-grid">
        {specs.map((spec) => {
          if (form.hidden.includes(spec.name)) return null;
          if (listKind(spec.kind))
            return (
              <ListField
                key={spec.name}
                form={form}
                spec={spec}
                kind={spec.kind}
                notes={listNotes?.(spec.name, draft)}
              />
            );
          const action = fieldActions?.[spec.name as S[number]["name"]];
          return (
            <SpecField
              key={spec.name}
              form={form}
              spec={spec}
              action={action?.(draft) ?? null}
            />
          );
        })}
      </div>
      {hint && <p className="form-hint">{hint}</p>}
      {form.formError && (
        <p className="error-text" role="alert">
          {form.formError}
        </p>
      )}
      <FormActions form={form} submitLabel={submitLabel} onCancel={onCancel} />
    </form>
  );
}

/** A row list, wide in the grid (ADR 0116 §11, ADR 0167). */
function ListField({
  form,
  spec,
  kind,
  notes,
}: {
  form: RecordFormState;
  spec: FieldSpec;
  kind: EventListKind;
  notes: ListNotes | null | undefined;
}) {
  const { draft, errors } = form;
  /** A row list's fixed first row, bound to its field in the draft (ADR 0167). */
  const leadOf = (lead: LeadRow | undefined): LeadBinding | undefined =>
    lead && {
      ...lead,
      value: draft[lead.field] ?? "",
      date: draft[lead.dateField] ?? "",
      error: errors[lead.field],
      onChange: (v) => form.patch({ [lead.field]: v }),
    };
  return (
    <div className="form-wide">
      <LoanEventRows
        kind={kind}
        name={spec.name}
        label={spec.label}
        help={spec.help}
        value={draft[spec.name] ?? ""}
        errors={errors}
        notes={notes}
        lead={leadOf(spec.lead)}
        onChange={(v) => form.editList(spec.name, v)}
      />
    </div>
  );
}

/** One plain field: a date or a number, with its optional field-row button. */
function SpecField({
  form,
  spec,
  action,
}: {
  form: RecordFormState;
  spec: FieldSpec;
  action: ReturnType<FieldAction>;
}) {
  const t = useT();
  const value = form.draft[spec.name] ?? "";
  const edit = (v: string) => form.patch({ [spec.name]: v });
  const input =
    spec.kind === "date" ? (
      <DateInput value={value} onChange={edit} />
    ) : (
      <TextInput
        value={value}
        onChange={edit}
        suffix={spec.suffix}
        inputMode="decimal"
        placeholder={spec.optional ? t.forms.defaultPlaceholder : undefined}
      />
    );
  return (
    <Field
      label={spec.label}
      required={!spec.optional}
      error={form.errors[spec.name]}
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
            onClick={() => action.patch && form.patch(action.patch)}
          >
            {action.label}
          </Button>
        </div>
      ) : (
        input
      )}
    </Field>
  );
}

/** The unsaved note, Cancel and Save. */
function FormActions({
  form,
  submitLabel,
  onCancel,
}: {
  form: RecordFormState;
  submitLabel: string;
  onCancel?: (() => void) | undefined;
}) {
  const t = useT();
  return (
    <div className="form-actions">
      {form.unsaved && (
        <span className="form-state">{t.common.unsavedChanges}</span>
      )}
      {onCancel && (
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={form.busy}
        >
          {t.common.cancel}
        </Button>
      )}
      <Button type="submit" variant="primary" disabled={form.busy}>
        {form.busy ? t.common.saving : submitLabel}
      </Button>
    </div>
  );
}
