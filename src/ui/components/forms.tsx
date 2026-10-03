// Form components — presentational fields plus a generic record form. Parsing/formatting
// helpers live in ../model/formParse (pure, re-exported here for convenient importing).
import { useEffect, useId, useState, type ReactNode } from "react";
import {
  collectValues,
  fieldHint,
  type FieldSpec,
  type ParsedValues,
} from "../model/formParse";
import { FORM_PARSERS } from "../model/formParsers";
import {
  BLANK_ROW,
  draftRowOf,
  readRows,
  rowProblems,
  writeRows,
  type EventListKind,
} from "../model/loanEventRows";
import { currencySymbol } from "../../lib/currency";
import { Button } from "./primitives";
import { DateInput } from "./DateInput";
import { FieldContext, useFieldControlProps } from "./fieldContext";
import { useT } from "../hooks/useT";
import { formWriteErrors } from "../model/writeError";
import { toWriteError, type WriteError } from "../../state/writeError";
import { useUiStore } from "../../state/uiStore";
import { isDirty } from "../model/dirty";

export function Field({
  id: idProp,
  label,
  error,
  help,
  required = false,
  children,
}: {
  /** The control's id, when something else must focus it (an error summary link). */
  id?: string | undefined;
  label: string;
  error?: string | undefined;
  help?: string | undefined;
  /** Marks the label "*" and the control aria-required (UX-040). */
  required?: boolean | undefined;
  children: ReactNode;
}) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const noteId = `${id}-note`;
  const note = error ?? help;
  return (
    <div className={`field${error ? " invalid" : ""}`}>
      {/* The "*" is CSS generated content with empty alt text: seen, not read
          (the control is aria-required instead) (UX-040). */}
      <label htmlFor={id} className={required ? "required" : undefined}>
        {label}
      </label>
      <FieldContext.Provider
        value={{
          id,
          invalid: Boolean(error),
          required,
          describedBy: note ? noteId : undefined,
        }}
      >
        {children}
      </FieldContext.Provider>
      {error ? (
        <span className="err" id={noteId}>
          {error}
        </span>
      ) : help ? (
        <span className="help" id={noteId}>
          {help}
        </span>
      ) : null}
    </div>
  );
}

export function TextInput({
  value,
  onChange,
  suffix,
  placeholder,
  inputMode = "text",
  ...rest
}: {
  value: string;
  onChange: (v: string) => void;
  suffix?: string | undefined;
  placeholder?: string | undefined;
  inputMode?: "text" | "decimal" | "numeric" | undefined;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const fieldProps = useFieldControlProps();
  return (
    <div className="input-wrap">
      <input
        {...fieldProps}
        className={suffix ? "has-suffix" : ""}
        value={value}
        placeholder={placeholder}
        inputMode={inputMode}
        onChange={(e) => onChange(e.target.value)}
        {...rest}
      />
      {suffix && <span className="suffix">{suffix}</span>}
    </div>
  );
}

export function SelectInput({
  value,
  onChange,
  options,
  ...rest
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
} & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange">) {
  const fieldProps = useFieldControlProps();
  return (
    <select
      {...fieldProps}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      {...rest}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function TextArea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>,
) {
  const fieldProps = useFieldControlProps();
  return <textarea {...fieldProps} {...props} />;
}

/** A checkbox inside a Field: the Field label and its own wrapping label both name it. */
export function Checkbox(
  props: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">,
) {
  const fieldProps = useFieldControlProps();
  return <input type="checkbox" {...fieldProps} {...props} />;
}

/**
 * A loan's prepayment or recast rows (ADR 0116 §11): a fieldset with a group per row,
 * a labelled control per cell, and add/remove buttons. The rows live in `value` as one
 * JSON draft (loanEventRows.ts). After a failed save, `errors` holds the list's parse
 * message under `name` (its bad cells are then marked) and an engine message per row
 * under `name.row`.
 */
function LoanEventRows({
  kind,
  name,
  label,
  help,
  value,
  errors,
  onChange,
}: {
  kind: EventListKind;
  name: string;
  label: string;
  help?: string | undefined;
  value: string;
  errors: Record<string, string>;
  onChange: (v: string) => void;
}) {
  const t = useT();
  const d = t.propertyDetail;
  const hint = t.forms.invalidHint;
  const helpId = useId();
  const rows = readRows(kind, value);
  const listError = errors[name];
  const set = (i: number, patch: Record<string, string>) =>
    onChange(writeRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r))));
  // A row's unparseable cells, marked only once a save has failed on them.
  const bad = rows.map((r) => (listError ? rowProblems(kind, r) : []));
  const cell = (
    i: number,
    key: string,
    cellLabel: string,
    message: string,
    control: ReactNode,
  ) => (
    <Field
      label={cellLabel}
      error={bad[i]?.includes(key) ? message : undefined}
    >
      {control}
    </Field>
  );
  return (
    <fieldset
      className="event-rows"
      aria-describedby={help ? helpId : undefined}
    >
      <legend>{label}</legend>
      {help && (
        <p className="help" id={helpId}>
          {help}
        </p>
      )}
      {listError && <p className="err">{listError}</p>}
      {rows.map((row, i) => {
        const rowName =
          kind === "prepayments"
            ? d.eventPrepaymentRow(i + 1)
            : d.eventRecastRow(i + 1);
        const rowError = errors[`${name}.${i}`];
        const rowErrorId = `${helpId}-row${i}`;
        const date = cell(
          i,
          "date",
          d.eventDate,
          hint.date,
          <DateInput value={row.date} onChange={(v) => set(i, { date: v })} />,
        );
        return (
          <div
            key={i}
            role="group"
            aria-label={rowName}
            aria-describedby={rowError ? rowErrorId : undefined}
            className={`event-row${rowError ? " invalid" : ""}`}
          >
            {"amount" in row ? (
              <>
                {date}
                {cell(
                  i,
                  "amount",
                  d.eventAmount,
                  hint.money,
                  <TextInput
                    value={row.amount}
                    onChange={(v) => set(i, { amount: v })}
                    suffix={currencySymbol()}
                    inputMode="decimal"
                  />,
                )}
                <Field label={d.eventEffect}>
                  <SelectInput
                    value={row.effect}
                    onChange={(v) => set(i, { effect: v })}
                    options={[
                      {
                        value: "lowerInstalment",
                        label: d.eventEffectLowerInstalment,
                      },
                      { value: "shortenTerm", label: d.eventEffectShortenTerm },
                    ]}
                  />
                </Field>
                {cell(
                  i,
                  "fee",
                  d.eventFee,
                  hint.money,
                  <TextInput
                    value={row.fee}
                    onChange={(v) => set(i, { fee: v })}
                    suffix={currencySymbol()}
                    inputMode="decimal"
                  />,
                )}
              </>
            ) : (
              <>
                {date}
                <Field label={d.eventMode}>
                  <SelectInput
                    value={row.mode}
                    onChange={(v) => set(i, { mode: v, value: "" })}
                    options={[
                      { value: "maturity", label: d.eventModeMaturity },
                      { value: "instalment", label: d.eventModeInstalment },
                    ]}
                  />
                </Field>
                {row.mode === "maturity"
                  ? cell(
                      i,
                      "value",
                      d.eventMaturity,
                      hint.date,
                      <DateInput
                        value={row.value}
                        onChange={(v) => set(i, { value: v })}
                      />,
                    )
                  : cell(
                      i,
                      "value",
                      d.eventInstalment,
                      hint.money,
                      <TextInput
                        value={row.value}
                        onChange={(v) => set(i, { value: v })}
                        suffix={currencySymbol()}
                        inputMode="decimal"
                      />,
                    )}
              </>
            )}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() =>
                onChange(writeRows(rows.filter((_, j) => j !== i)))
              }
            >
              {d.eventRemove(rowName)}
            </Button>
            {rowError && (
              <p className="err" id={rowErrorId}>
                {rowError}
              </p>
            )}
          </div>
        );
      })}
      <Button
        type="button"
        size="sm"
        onClick={() => onChange(writeRows([...rows, BLANK_ROW[kind]]))}
      >
        {kind === "prepayments" ? d.eventAddPrepayment : d.eventAddRecast}
      </Button>
    </fieldset>
  );
}

const listKind = (kind: string | undefined): kind is EventListKind =>
  kind === "prepayments" || kind === "recasts";

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
}) {
  const t = useT();
  const [draft, setDraft] = useState<Record<string, string>>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Leave guard (UX-073): while the draft differs from the values the form opened with
  // (or last saved), navigation asks first. Each form registers under its own key.
  const formKey = useId();
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

  async function submit() {
    const { values, errors: errs } = collectValues(specs, draft, {
      parsers: FORM_PARSERS,
      blank: () => t.forms.required,
      invalid: (spec) => fieldHint(t, spec),
    });
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
      {header?.(draft, (p) => setDraft((d) => ({ ...d, ...p })))}
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
            spec.kind === "draws" ? (
              <TextArea
                className="draws-input"
                rows={3}
                value={draft[spec.name] ?? ""}
                placeholder={t.forms.drawsPlaceholder}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, [spec.name]: e.target.value }))
                }
              />
            ) : spec.kind === "date" ? (
              <DateInput
                value={draft[spec.name] ?? ""}
                onChange={(v) => setDraft((d) => ({ ...d, [spec.name]: v }))}
              />
            ) : (
              <TextInput
                value={draft[spec.name] ?? ""}
                onChange={(v) => setDraft((d) => ({ ...d, [spec.name]: v }))}
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
                    onClick={() =>
                      action.patch &&
                      setDraft((d) => ({ ...d, ...action.patch }))
                    }
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
