// A loan's prepayment, recast or tranche rows in the mortgage form (ADR 0116 §11,
// ADR 0167). What differs per kind is KIND_VIEW here and EVENT_KINDS in the model.
import { useEffect, useId, useRef, type ReactNode } from "react";
import { parseDate, type LeadRow } from "../../model/formParse";
import {
  BLANK_ROW,
  rowProblems,
  type EventListKind,
  type PrepaymentRow,
  type RecastRow,
  type RowOf,
} from "../../model/loanEventRows";
import { CZK } from "../../../lib/currency";
import { fmtDate } from "../../../lib/format";
import { Button } from "../../components/Button";
import { RowAction, RowActions } from "../../components/RowActions";
import { Plus, Trash2 } from "lucide-react";
import { DateInput } from "../../components/DateInput";
import { Field, SelectInput, TextInput } from "../../components/fields";
import { useT } from "../../hooks/useT";
import type { Dictionary } from "../../../i18n";

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

type Labels = Dictionary["propertyDetail"];

/** The cells of one row after its date, and how they edit it. */
interface CellsProps<R> {
  row: R;
  set: (patch: Partial<R>) => void;
  invalid: boolean;
  /** A cell's message, shown once a save has failed on the list and the cell is bad. */
  err: (cell: string, message: string) => string | undefined;
}

const MoneyInput = ({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) => (
  <TextInput
    value={value}
    onChange={onChange}
    suffix={CZK.symbol}
    inputMode="decimal"
  />
);

function DrawCells({ row, set, invalid, err }: CellsProps<RowOf["draws"]>) {
  const t = useT();
  return (
    <Field
      invalid={invalid}
      label={t.propertyDetail.eventAmount}
      error={err("amount", t.forms.positiveAmount)}
    >
      <MoneyInput value={row.amount} onChange={(v) => set({ amount: v })} />
    </Field>
  );
}

function PrepaymentCells({
  row,
  set,
  invalid,
  err,
}: CellsProps<PrepaymentRow>) {
  const t = useT();
  const d = t.propertyDetail;
  return (
    <>
      <Field
        invalid={invalid}
        label={d.eventAmount}
        error={err("amount", t.forms.positiveAmount)}
      >
        <MoneyInput value={row.amount} onChange={(v) => set({ amount: v })} />
      </Field>
      <Field invalid={invalid} label={d.eventEffect}>
        <SelectInput
          value={row.effect}
          onChange={(v) => set({ effect: v as PrepaymentRow["effect"] })}
          options={[
            { value: "lowerInstalment", label: d.eventEffectLowerInstalment },
            { value: "shortenTerm", label: d.eventEffectShortenTerm },
          ]}
        />
      </Field>
      <Field
        invalid={invalid}
        label={d.eventFee}
        error={err("fee", t.forms.invalidHint.money)}
      >
        <MoneyInput value={row.fee} onChange={(v) => set({ fee: v })} />
      </Field>
    </>
  );
}

function RecastCells({ row, set, invalid, err }: CellsProps<RecastRow>) {
  const t = useT();
  const d = t.propertyDetail;
  return (
    <>
      <Field invalid={invalid} label={d.eventMode}>
        <SelectInput
          value={row.mode}
          onChange={(v) => set({ mode: v as RecastRow["mode"], value: "" })}
          options={[
            { value: "maturity", label: d.eventModeMaturity },
            { value: "instalment", label: d.eventModeInstalment },
          ]}
        />
      </Field>
      {row.mode === "maturity" ? (
        <Field
          invalid={invalid}
          label={d.eventMaturity}
          error={err("value", t.forms.invalidHint.date)}
        >
          <DateInput value={row.value} onChange={(v) => set({ value: v })} />
        </Field>
      ) : (
        <Field
          invalid={invalid}
          label={d.eventInstalment}
          error={err("value", t.forms.positiveAmount)}
        >
          <MoneyInput value={row.value} onChange={(v) => set({ value: v })} />
        </Field>
      )}
    </>
  );
}

/** The view's part of each list kind (the model's is EVENT_KINDS). */
const KIND_VIEW: {
  [K in EventListKind]: {
    rowName: (d: Labels, n: number) => string;
    addLabel: (d: Labels) => string;
    Cells: (props: CellsProps<RowOf[K]>) => ReactNode;
  };
} = {
  prepayments: {
    rowName: (d, n) => d.eventPrepaymentRow(n),
    addLabel: (d) => d.eventAddPrepayment,
    Cells: PrepaymentCells,
  },
  recasts: {
    rowName: (d, n) => d.eventRecastRow(n),
    addLabel: (d) => d.eventAddRecast,
    Cells: RecastCells,
  },
  draws: {
    rowName: (d, n) => d.trancheRow(n),
    addLabel: (d) => d.addTranche,
    Cells: DrawCells,
  },
};

/**
 * A loan's prepayment, recast or tranche rows (ADR 0116 §11, ADR 0167): a fieldset with
 * a group per row, a labelled control per cell, and add/remove buttons. After a failed
 * save, `errors` holds the list's parse message under `name` (its bad cells are then
 * marked) and an engine message per row under `name.row`. Add focuses the new row;
 * Remove focuses the next row, or Add when none follows. Rows are keyed by position.
 */
export function LoanEventRows<K extends EventListKind>({
  kind,
  name,
  label,
  help,
  rows,
  errors,
  onChange,
  lead,
  notes,
}: {
  kind: K;
  name: string;
  label: string;
  help?: string | undefined;
  rows: readonly RowOf[K][];
  errors: Record<string, string>;
  onChange: (rows: RowOf[K][]) => void;
  lead?: LeadBinding | undefined;
  notes?: ListNotes | null | undefined;
}) {
  const t = useT();
  const helpId = useId();
  const listError = errors[name];
  const box = useRef<HTMLFieldSetElement>(null);
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
      {lead && <LeadRowView lead={lead} />}
      {rows.map((row, i) => (
        <EventRowGroup
          // Keyed by position: stable row ids would be a change that needs an ADR.
          key={i}
          kind={kind}
          row={row}
          index={i}
          idBase={helpId}
          rowError={errors[`${name}.${i}`]}
          rowNotes={notes?.rows[i] ?? []}
          listFailed={Boolean(listError)}
          set={(patch) =>
            onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))
          }
          onRemove={() => {
            focusTo.current = i < rows.length - 1 ? i : "add";
            onChange(rows.filter((_, j) => j !== i));
          }}
        />
      ))}
      <Button
        data-add
        type="button"
        size="sm"
        icon={Plus}
        onClick={() => {
          focusTo.current = rows.length;
          onChange([...rows, BLANK_ROW[kind]]);
        }}
      >
        {KIND_VIEW[kind].addLabel(t.propertyDetail)}
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

/** The list's fixed first row: the date it mirrors and its amount (ADR 0167). */
function LeadRowView({ lead }: { lead: LeadBinding }) {
  const t = useT();
  const leadDate = parseDate(lead.date);
  return (
    <div className="event-row lead">
      <div className="field lead-date">
        <span className="label">{t.propertyDetail.eventDate}</span>
        <span className="value">
          {leadDate ? fmtDate(leadDate) : lead.dateFallback}
        </span>
      </div>
      <Field label={lead.label} required error={lead.error}>
        <MoneyInput value={lead.value} onChange={lead.onChange} />
      </Field>
    </div>
  );
}

/** One row: its group, the date, the kind's cells, Remove and its messages. */
function EventRowGroup<K extends EventListKind>({
  kind,
  row,
  index: i,
  idBase,
  rowError,
  rowNotes,
  listFailed,
  set,
  onRemove,
}: {
  kind: K;
  row: RowOf[K];
  index: number;
  idBase: string;
  rowError: string | undefined;
  rowNotes: readonly string[];
  listFailed: boolean;
  set: (patch: Partial<RowOf[K]>) => void;
  onRemove: () => void;
}) {
  const t = useT();
  const d = t.propertyDetail;
  const view = KIND_VIEW[kind];
  const Cells = view.Cells as (props: CellsProps<RowOf[K]>) => ReactNode;
  const rowName = view.rowName(d, i + 1);
  const invalid = Boolean(rowError);
  const rowErrorId = `${idBase}-row${i}`;
  const noteId = `${idBase}-note${i}`;
  // Unparseable cells are marked only once a save has failed on the list.
  const bad = listFailed ? rowProblems(row) : [];
  const err = (cell: string, message: string) =>
    bad.includes(cell) ? message : undefined;
  return (
    <div
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
      <Field
        invalid={invalid}
        label={d.eventDate}
        error={err("date", t.forms.invalidHint.date)}
      >
        <DateInput
          value={row.date}
          onChange={(v) => set({ date: v } as Partial<RowOf[K]>)}
        />
      </Field>
      <Cells row={row} set={set} invalid={invalid} err={err} />
      <RowActions>
        <RowAction
          icon={Trash2}
          label={d.eventRemove(rowName)}
          danger
          onClick={onRemove}
        />
      </RowActions>
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
}
