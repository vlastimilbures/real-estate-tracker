// A loan's prepayment, recast or tranche rows inside RecordForm (ADR 0116 §11, ADR 0167).
import { useEffect, useId, useRef } from "react";
import { parseDate, type LeadRow } from "../model/formParse";
import {
  BLANK_ROW,
  readRows,
  rowProblems,
  writeRows,
  type EventListKind,
} from "../model/loanEventRows";
import { currencySymbol } from "../../lib/currency";
import { fmtDate } from "../../lib/format";
import { Button } from "./primitives";
import { DateInput } from "./DateInput";
import { Field, SelectInput, TextInput } from "./fields";
import { useT } from "../hooks/useT";

/** Draft-derived notes of a row list: soft warnings per draft row and a footer line. */
export interface ListNotes {
  rows: readonly (readonly string[])[];
  footer: string | null;
}

/** The fixed first row of a row list, bound to another field of the draft (ADR 0167). */
export interface LeadBinding extends LeadRow {
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
export function LoanEventRows({
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
