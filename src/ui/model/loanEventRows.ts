// The mortgage form's prepayment, recast and development-draw rows (ADR 0116 §11,
// ADR 0167). Pure. The form keeps each list as an array of typed rows; a row's `kind` is
// its list's name, and EVENT_KINDS holds what differs per kind. The unsaved check
// compares a list by its text (`writeRows`). Blank rows are ignored. The form submits the
// other rows in the order shown; the engine sorts by date itself, so an engine error's
// `index` is a position among the non-blank rows (`draftRowOf` maps it back).
import {
  dateDraft,
  moneyDraft,
  parseDate,
  parseMoney,
  type FormLists,
} from "./formParse";
import { scheduledPrincipal } from "../../engine";
import type {
  Money,
  LoanRecast,
  MortgageDraw,
  MortgagePrepayment,
  PrepaymentEffect,
} from "../../engine";
import type { Decimal } from "../../lib/money";

export type EventListKind = "prepayments" | "recasts" | "draws";

const listKind = (kind: string | undefined): kind is EventListKind =>
  kind === "prepayments" || kind === "recasts" || kind === "draws";

export interface PrepaymentRow {
  kind: "prepayments";
  date: string;
  amount: string;
  effect: PrepaymentEffect;
  fee: string;
}

export interface RecastRow {
  kind: "recasts";
  date: string;
  /** A new maturity date, or a new instalment the term follows from. */
  mode: "maturity" | "instalment";
  value: string;
}

/** A development-loan tranche drawn after the start (ADR 0167). */
export interface DrawRow {
  kind: "draws";
  date: string;
  amount: string;
}

/** The row of each list kind. */
export interface RowOf {
  prepayments: PrepaymentRow;
  recasts: RecastRow;
  draws: DrawRow;
}

/** The engine event of each list kind. */
interface EventOf {
  prepayments: MortgagePrepayment;
  recasts: LoanRecast;
  draws: MortgageDraw;
}

/** A mortgage draft's row lists. */
export type EventLists = { [K in EventListKind]: RowOf[K][] };

export type EventRow = RowOf[EventListKind];

/** What differs between the list kinds (the view's part is in LoanEventRows). */
interface EventKind<K extends EventListKind> {
  /** A new row's draft. */
  blank: RowOf[K];
  /** The row of a stored event. */
  rowOf(event: EventOf[K]): RowOf[K];
  /** The text cells of a row (a select is never blank). */
  texts(row: RowOf[K]): string[];
  /** Each cell parsed; null where it does not parse. */
  cells(row: RowOf[K]): Record<string, unknown>;
  /** The event of a row that is not blank, or null when it does not parse. */
  event(row: RowOf[K]): EventOf[K] | null;
}

const positive = (raw: string) => {
  const m = parseMoney(raw);
  return m !== null && m.greaterThan(0) ? m : null;
};

/** An optional fee: undefined when blank, null when not an amount of 0 or more. */
function parseFee(raw: string): Money | null | undefined {
  if (raw.trim() === "") return undefined;
  const fee = parseMoney(raw);
  return fee?.isNegative() ? null : fee;
}

const prepaymentCells = (row: PrepaymentRow) => ({
  date: parseDate(row.date),
  amount: positive(row.amount),
  fee: parseFee(row.fee),
});

const recastCells = (row: RecastRow) => ({
  date: parseDate(row.date),
  value: row.mode === "maturity" ? parseDate(row.value) : positive(row.value),
});

const drawCells = (row: DrawRow) => ({
  date: parseDate(row.date),
  amount: positive(row.amount),
});

const PREPAYMENTS: EventKind<"prepayments"> = {
  blank: {
    kind: "prepayments",
    date: "",
    amount: "",
    effect: "lowerInstalment",
    fee: "",
  },
  rowOf: (p) => ({
    kind: "prepayments",
    date: dateDraft(p.date),
    amount: moneyDraft(p.amount),
    effect: p.effect,
    fee: moneyDraft(p.fee),
  }),
  texts: (row) => [row.date, row.amount, row.fee],
  cells: prepaymentCells,
  event(row) {
    const { date, amount, fee } = prepaymentCells(row);
    if (!date || !amount || fee === null) return null;
    return { date, amount, effect: row.effect, ...(fee ? { fee } : {}) };
  },
};

const RECASTS: EventKind<"recasts"> = {
  blank: { kind: "recasts", date: "", mode: "maturity", value: "" },
  rowOf: (r) =>
    r.maturity !== undefined
      ? {
          kind: "recasts",
          date: dateDraft(r.date),
          mode: "maturity",
          value: dateDraft(r.maturity),
        }
      : {
          kind: "recasts",
          date: dateDraft(r.date),
          mode: "instalment",
          value: moneyDraft(r.instalment),
        },
  texts: (row) => [row.date, row.value],
  cells: recastCells,
  event(row) {
    const { date, value } = recastCells(row);
    if (!date || !value) return null;
    // A maturity parses to a date, an instalment to an amount.
    return value instanceof Date
      ? { date, maturity: value }
      : { date, instalment: value };
  },
};

const DRAWS: EventKind<"draws"> = {
  blank: { kind: "draws", date: "", amount: "" },
  rowOf: (x) => ({
    kind: "draws",
    date: dateDraft(x.date),
    amount: moneyDraft(x.amount),
  }),
  texts: (row) => [row.date, row.amount],
  cells: drawCells,
  event(row) {
    const { date, amount } = drawCells(row);
    return date && amount ? { date, amount } : null;
  },
};

const EVENT_KINDS: { [K in EventListKind]: EventKind<K> } = {
  prepayments: PREPAYMENTS,
  recasts: RECASTS,
  draws: DRAWS,
};

/** A new row of each kind. */
export const BLANK_ROW: RowOf = {
  prepayments: PREPAYMENTS.blank,
  recasts: RECASTS.blank,
  draws: DRAWS.blank,
};

/** The kind entry of a row. */
function kindOf<K extends EventListKind>(row: RowOf[K]): EventKind<K> {
  return EVENT_KINDS[row.kind] as EventKind<K>;
}

/** A list's text for the unsaved check: "" when there is no row, so an untouched empty
 *  list stays clean; else the rows as JSON, key order included. */
export function writeRows(rows: readonly object[]): string {
  return rows.length === 0 ? "" : JSON.stringify(rows);
}

export const prepaymentsDraft = (
  list?: MortgagePrepayment[],
): PrepaymentRow[] => (list ?? []).map(PREPAYMENTS.rowOf);

export const drawsDraft = (list?: MortgageDraw[]): DrawRow[] =>
  (list ?? []).map(DRAWS.rowOf);

export const recastsDraft = (list?: LoanRecast[]): RecastRow[] =>
  (list ?? []).map(RECASTS.rowOf);

const isBlank = (row: EventRow) =>
  kindOf(row)
    .texts(row)
    .every((v) => v.trim() === "");

/** True when a list has a row that is not blank. */
export function hasRows(rows: readonly EventRow[]): boolean {
  return rows.some((row) => !isBlank(row));
}

/** The cells of a row that do not parse, in column order ([] for a blank row). */
export function rowProblems(row: EventRow): string[] {
  if (isBlank(row)) return [];
  return Object.entries(kindOf(row).cells(row))
    .filter(([, v]) => v === null)
    .map(([k]) => k);
}

/** A list's events in row order, or null when a non-blank row does not parse. */
function parseRows<K extends EventListKind>(
  rows: readonly RowOf[K][],
): EventOf[K][] | null {
  const out: EventOf[K][] = [];
  for (const row of rows) {
    if (isBlank(row)) continue;
    const e = kindOf<K>(row).event(row);
    if (!e) return null;
    out.push(e);
  }
  return out;
}

// One list kind's parse, for the tests (the form parses its lists through EVENT_LISTS).
/** @internal */
export const parsePrepaymentRows = (rows: readonly PrepaymentRow[]) =>
  parseRows<"prepayments">(rows);
/** @internal */
export const parseRecastRows = (rows: readonly RecastRow[]) =>
  parseRows<"recasts">(rows);
/** The tranches in row order (the engine does not depend on their order).
 *  @internal */
export const parseDrawRows = (rows: readonly DrawRow[]) =>
  parseRows<"draws">(rows);

/**
 * The total loan the form shows under the drawdown schedule: the start draw plus every
 * tranche row that parses (ADR 0167), summed by the engine's `scheduledPrincipal` as the
 * saved block's total is. Null until the start draw is an amount of 0 or more.
 */
export function drawdownTotal(
  startDraft: string,
  rows: readonly DrawRow[],
): { total: Decimal; tranches: number } | null {
  const start = parseMoney(startDraft);
  if (!start || start.isNegative()) return null;
  const draws = rows
    .map((row) => (isBlank(row) ? null : DRAWS.event(row)))
    .filter((x): x is MortgageDraw => x !== null);
  return {
    total: scheduledPrincipal({ initialPrincipal: start, draws }),
    tranches: draws.length,
  };
}

export type DrawWarning = "afterCompletion" | "sameDate";

/**
 * Soft warnings per draft row (ADR 0167 §3); they never block a save. A tranche dated
 * after the interest-only end re-amortizes the loan again; two tranches on one date are
 * added together. A row without a valid date gets none.
 */
export function drawWarnings(
  rows: readonly DrawRow[],
  completionDraft: string,
): DrawWarning[][] {
  const completion = parseDate(completionDraft);
  const dates = rows.map((row) => parseDate(row.date)?.getTime());
  return dates.map((t) => {
    if (t === undefined) return [];
    const out: DrawWarning[] = [];
    if (completion && t > completion.getTime()) out.push("afterCompletion");
    if (dates.filter((x) => x === t).length > 1) out.push("sameDate");
    return out;
  });
}

/** The draft row of the `index`-th non-blank row (an engine error's index), or null. */
export function draftRowOf(
  rows: readonly EventRow[],
  index: number,
): number | null {
  let seen = -1;
  for (const [i, row] of rows.entries()) {
    if (!isBlank(row) && ++seen === index) return i;
  }
  return null;
}

/** The mortgage form's row lists, as useRecordForm keeps them beside the fields. */
export const EVENT_LISTS: FormLists<EventLists> = {
  texts: (lists) => ({
    draws: writeRows(lists.draws),
    prepayments: writeRows(lists.prepayments),
    recasts: writeRows(lists.recasts),
  }),
  // A list with no row is null, as a blank optional field; one whose rows do not parse
  // gets its list's message.
  parse(lists, t) {
    const values: Record<string, unknown> = {};
    const errors: Record<string, string> = {};
    for (const kind of ["draws", "prepayments", "recasts"] as const) {
      const rows = lists[kind];
      const parsed = rows.length === 0 ? null : parseRows(rows);
      if (rows.length > 0 && parsed === null)
        errors[kind] = t.forms.invalidHint[kind];
      else values[kind] = parsed;
    }
    return { values, errors };
  },
  rowOf: (lists, field, index) =>
    listKind(field) ? draftRowOf(lists[field], index) : null,
};
