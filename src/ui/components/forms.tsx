// Form components — a generic record form: its state is useRecordForm's, field controls
// live in ./fields and parsing/formatting helpers in ../model/formParse. A form with
// more than text fields (the mortgage form) renders RecordFormView with its own parts.
import { Fragment, type ReactNode } from "react";
import type { FieldSpec } from "../model/formParse";
import { Button } from "./primitives";
import { DateInput } from "./DateInput";
import { Field, TextInput } from "./fields";
import { useT } from "../hooks/useT";
import {
  useRecordForm,
  type RecordFormOptions,
  type RecordFormState,
} from "../hooks/useRecordForm";

type Draft = Record<string, string>;

/** A button to the right of a field that patches the draft on click; without a `patch`
 *  it renders disabled (not yet computable). */
export interface FieldAction {
  label: string;
  title?: string | undefined;
  patch?: Draft | undefined;
}

interface RecordFormViewProps {
  form: RecordFormState;
  specs: readonly FieldSpec[];
  submitLabel: string;
  onCancel?: (() => void) | undefined;
  /** Above the fields, e.g. a mode switch kept in the draft (ADR 0098). */
  header?: ReactNode;
  /** A live hint under the fields (e.g. a suggested instalment). */
  hint?: string | null | undefined;
  /** Field-row buttons by field name; a missing or null entry shows none. */
  actions?: Readonly<Record<string, FieldAction | null>> | undefined;
  /** What to show in place of a field, by field name (a row list). */
  slots?: Readonly<Record<string, (spec: FieldSpec) => ReactNode>> | undefined;
}

/** Controlled record form: renders specs, validates on submit, and hands back values
 *  typed by the specs (declare them inline so their names and kinds stay literal). */
export function RecordForm<const S extends readonly FieldSpec[]>({
  specs,
  initial,
  onSubmit,
  hiddenFields,
  unsavedKey,
  submitLabel,
  onCancel,
}: RecordFormOptions<S> & {
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
  return (
    <RecordFormView
      form={form}
      specs={specs}
      submitLabel={submitLabel}
      onCancel={onCancel}
    />
  );
}

/** The record form's markup, from its state (useRecordForm). */
export function RecordFormView({
  form,
  specs,
  submitLabel,
  onCancel,
  header,
  hint,
  actions,
  slots,
}: RecordFormViewProps) {
  return (
    <form
      className="record-form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void form.submit();
      }}
    >
      {header}
      <div className="form-grid">
        {specs.map((spec) => {
          if (form.hidden.includes(spec.name)) return null;
          const slot = slots?.[spec.name];
          if (slot) return <Fragment key={spec.name}>{slot(spec)}</Fragment>;
          return (
            <SpecField
              key={spec.name}
              form={form}
              spec={spec}
              action={actions?.[spec.name] ?? null}
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

/** One plain field: a date or a number, with its optional field-row button. */
function SpecField({
  form,
  spec,
  action,
}: {
  form: RecordFormState;
  spec: FieldSpec;
  action: FieldAction | null;
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
