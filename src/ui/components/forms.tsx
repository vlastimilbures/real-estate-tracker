// Form components — presentational fields plus a generic record form. Parsing/formatting
// helpers live in ../model/formParse (pure, re-exported here for convenient importing).
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  collectValues,
  parseDate,
  type FieldSpec,
  type LeadRow,
  type ParsedValues,
} from "../model/formParse";
import { formRules } from "../model/formParsers";
import {
  BLANK_ROW,
  draftRowOf,
  readRows,
  rowProblems,
  writeRows,
  type EventListKind,
} from "../model/loanEventRows";
import { currencySymbol } from "../../lib/currency";
import { fmtDate } from "../../lib/format";
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

/** Draft-derived notes of a row list: soft warnings per draft row and a footer line. */
export interface ListNotes {
  rows: readonly (readonly string[])[];
  footer: string | null;
}

/** The fixed first row of a row list, bound to another field of the draft (ADR 0167). */
interface LeadBinding extends LeadRow {
  value: string;
  date: string;
  error: string | undefined;
  onChange: (v: string) => void;
}

const ROW_NAME: Record<
  EventListKind,
  (d: ReturnType<typeof useT>["propertyDetail"], n: number) => string
> = {
  prepayments: (d, n) => d.eventPrepaymentRow(n),
  recasts: (d, n) => d.eventRecastRow(n),
  draws: (d, n) => d.trancheRow(n),
};

/**
 * A loan's prepayment, recast or tranche rows (ADR 0116 §11, ADR 0167): a fieldset with
 * a group per row, a labelled control per cell, and add/remove buttons. The rows live in
 * `value` as one JSON draft (loanEventRows.ts). After a failed save, `errors` holds the
 * list's parse message under `name` (its bad cells are then marked) and an engine message
 * per row under `name.row`. Add focuses the new row; Remove focuses the next row, or Add
 * when none follows.
 */
function LoanEventRows({
  kind,
  name,
  label,
  help,
  value,
  errors,
  onChange,
  lead,
  notes,
}: {
  kind: EventListKind;
  name: string;
  label: string;
  help?: string | undefined;
  value: string;
  errors: Record<string, string>;
  onChange: (v: string) => void;
  lead?: LeadBinding | undefined;
  notes?: ListNotes | null | undefined;
}) {
  const t = useT();
  const d = t.propertyDetail;
  const hint = t.forms.invalidHint;
  const helpId = useId();
  const rows = readRows(value);
  const listError = errors[name];
  const set = (i: number, patch: Record<string, string>) =>
    onChange(writeRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r))));
  const box = useRef<HTMLFieldSetElement>(null);
  const leadDate = lead ? parseDate(lead.date) : null;
  // Where focus goes once an add or remove has rendered: a row index or the Add button.
  const focusTo = useRef<number | "add" | null>(null);
  useEffect(() => {
    const to = focusTo.current;
    if (to === null) return;
    focusTo.current = null;
    const target =
      to === "add"
        ? box.current?.querySelector<HTMLElement>("[data-add]")
        : box.current
            ?.querySelectorAll<HTMLElement>("[data-row]")
            [to]?.querySelector<HTMLElement>("input, select");
    target?.focus();
  });
  const money = (v: string, onCell: (v: string) => void) => (
    <TextInput
      value={v}
      onChange={onCell}
      suffix={currencySymbol()}
      inputMode="decimal"
    />
  );
  return (
    <fieldset
      ref={box}
      className={`event-rows ${kind}`}
      aria-describedby={
        [listError && `${helpId}-err`, help && helpId]
          .filter(Boolean)
          .join(" ") || undefined
      }
    >
      <legend>{label}</legend>
      {help && (
        <p className="help" id={helpId}>
          {help}
        </p>
      )}
      {listError && (
        <p className="err" id={`${helpId}-err`}>
          {listError}
        </p>
      )}
      {lead && (
        <div className="event-row lead">
          <div className="field lead-date">
            <span className="label">{d.eventDate}</span>
            <span className="value">
              {leadDate ? fmtDate(leadDate) : lead.dateFallback}
            </span>
          </div>
          <Field label={lead.label} required error={lead.error}>
            {money(lead.value, lead.onChange)}
          </Field>
        </div>
      )}
      {rows.map((row, i) => {
        const rowName = ROW_NAME[kind](d, i + 1);
        const rowError = errors[`${name}.${i}`];
        const rowErrorId = `${helpId}-row${i}`;
        const rowNotes = notes?.rows[i] ?? [];
        const noteId = `${helpId}-note${i}`;
        // Unparseable cells are marked only once a save has failed on the list.
        const bad = listError ? rowProblems(row) : [];
        const err = (cell: string, message: string) =>
          bad.includes(cell) ? message : undefined;
        return (
          <div
            key={i}
            data-row
            role="group"
            aria-label={rowName}
            aria-describedby={
              [rowError && rowErrorId, rowNotes.length > 0 && noteId]
                .filter(Boolean)
                .join(" ") || undefined
            }
            className={`event-row${rowError ? " invalid" : ""}`}
          >
            <Field label={d.eventDate} error={err("date", hint.date)}>
              <DateInput
                value={row.date}
                onChange={(v) => set(i, { date: v })}
              />
            </Field>
            {!("effect" in row) && !("mode" in row) ? (
              <Field
                label={d.eventAmount}
                error={err("amount", t.forms.positiveAmount)}
              >
                {money(row.amount, (v) => set(i, { amount: v }))}
              </Field>
            ) : "effect" in row ? (
              <>
                <Field
                  label={d.eventAmount}
                  error={err("amount", t.forms.positiveAmount)}
                >
                  {money(row.amount, (v) => set(i, { amount: v }))}
                </Field>
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
                <Field label={d.eventFee} error={err("fee", hint.money)}>
                  {money(row.fee, (v) => set(i, { fee: v }))}
                </Field>
              </>
            ) : (
              <>
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
                {row.mode === "maturity" ? (
                  <Field
                    label={d.eventMaturity}
                    error={err("value", hint.date)}
                  >
                    <DateInput
                      value={row.value}
                      onChange={(v) => set(i, { value: v })}
                    />
                  </Field>
                ) : (
                  <Field
                    label={d.eventInstalment}
                    error={err("value", t.forms.positiveAmount)}
                  >
                    {money(row.value, (v) => set(i, { value: v }))}
                  </Field>
                )}
              </>
            )}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                focusTo.current = i < rows.length - 1 ? i : "add";
                onChange(writeRows(rows.filter((_, j) => j !== i)));
              }}
            >
              {d.eventRemove(rowName)}
            </Button>
            {rowError && (
              <p className="err" id={rowErrorId}>
                {rowError}
              </p>
            )}
            {rowNotes.length > 0 && (
              <p className="note" id={noteId}>
                {rowNotes.join(" ")}
              </p>
            )}
          </div>
        );
      })}
      <Button
        data-add
        type="button"
        size="sm"
        onClick={() => {
          focusTo.current = rows.length;
          onChange(writeRows([...rows, BLANK_ROW[kind]]));
        }}
      >
        {kind === "prepayments"
          ? d.eventAddPrepayment
          : kind === "recasts"
            ? d.eventAddRecast
            : d.addTranche}
      </Button>
      {notes && (
        // Mounted while the list shows, so a screen reader hears the total change.
        <p className="total" aria-live="polite" aria-atomic="true">
          {notes.footer}
        </p>
      )}
    </fieldset>
  );
}

const listKind = (kind: string | undefined): kind is EventListKind =>
  kind === "prepayments" || kind === "recasts" || kind === "draws";

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
