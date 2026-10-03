// The mortgage form's prepayment and recast rows (ADR 0116 §11). Pure. A draft keeps a
// list as one JSON string under its field name, so the form's dirty check and leave guard
// compare it like any other field. Blank rows are ignored. The form submits the other
// rows in the order shown; the engine sorts by date itself, so an engine error's `index`
// is a position among the non-blank rows (`draftRowOf` maps it back).
import { dateDraft, moneyDraft, parseDate, parseMoney } from "./formParse";
import type {
  Money,
  LoanRecast,
  MortgagePrepayment,
  PrepaymentEffect,
} from "../../engine";

export type EventListKind = "prepayments" | "recasts";

export interface PrepaymentRow {
  date: string;
  amount: string;
  effect: PrepaymentEffect;
  fee: string;
}

export interface RecastRow {
  date: string;
  /** A new maturity date, or a new instalment the term follows from. */
  mode: "maturity" | "instalment";
  value: string;
}

interface Rows {
  prepayments: PrepaymentRow;
  recasts: RecastRow;
}

/** A new row's draft. */
export const BLANK_ROW: Rows = {
  prepayments: { date: "", amount: "", effect: "lowerInstalment", fee: "" },
  recasts: { date: "", mode: "maturity", value: "" },
};

type Row = PrepaymentRow | RecastRow;

/** The rows of a list draft ("" ⇒ none). */
export function readRows<R extends Row = Row>(draft: string): R[] {
  return draft === "" ? [] : (JSON.parse(draft) as R[]);
}

/** A list draft: "" when there is no row, so an untouched empty list stays clean. */
export function writeRows(rows: readonly object[]): string {
  return rows.length === 0 ? "" : JSON.stringify(rows);
}

export function prepaymentsDraft(list?: MortgagePrepayment[]): string {
  return writeRows(
    (list ?? []).map((p): PrepaymentRow => ({
      date: dateDraft(p.date),
      amount: moneyDraft(p.amount),
      effect: p.effect,
      fee: moneyDraft(p.fee),
    })),
  );
}

export function recastsDraft(list?: LoanRecast[]): string {
  return writeRows(
    (list ?? []).map((r): RecastRow =>
      r.maturity !== undefined
        ? {
            date: dateDraft(r.date),
            mode: "maturity",
            value: dateDraft(r.maturity),
          }
        : {
            date: dateDraft(r.date),
            mode: "instalment",
            value: moneyDraft(r.instalment),
          },
    ),
  );
}

const positive = (raw: string) => {
  const m = parseMoney(raw);
  return m !== null && m.greaterThan(0) ? m : null;
};

const isBlank = (row: Row) =>
  "amount" in row
    ? [row.date, row.amount, row.fee].every((v) => v.trim() === "")
    : [row.date, row.value].every((v) => v.trim() === "");

/** An optional fee: undefined when blank, null when not an amount of 0 or more. */
function parseFee(raw: string): Money | null | undefined {
  if (raw.trim() === "") return undefined;
  const fee = parseMoney(raw);
  return fee?.isNegative() ? null : fee;
}

/** Each cell parsed; null where it does not parse. */
function cells(row: Row): Record<string, unknown> {
  if ("amount" in row)
    return {
      date: parseDate(row.date),
      amount: positive(row.amount),
      fee: parseFee(row.fee),
    };
  return {
    date: parseDate(row.date),
    value: row.mode === "maturity" ? parseDate(row.value) : positive(row.value),
  };
}

/** The cells of a row that do not parse, in column order ([] for a blank row). */
export function rowProblems(row: Row): string[] {
  if (isBlank(row)) return [];
  return Object.entries(cells(row))
    .filter(([, v]) => v === null)
    .map(([k]) => k);
}

function toPrepayment(row: PrepaymentRow): MortgagePrepayment | null {
  const date = parseDate(row.date);
  const amount = positive(row.amount);
  const fee = parseFee(row.fee);
  if (!date || !amount || fee === null) return null;
  return { date, amount, effect: row.effect, ...(fee ? { fee } : {}) };
}

function toRecast(row: RecastRow): LoanRecast | null {
  const date = parseDate(row.date);
  if (!date) return null;
  if (row.mode === "maturity") {
    const maturity = parseDate(row.value);
    return maturity ? { date, maturity } : null;
  }
  const instalment = positive(row.value);
  return instalment ? { date, instalment } : null;
}

/** A list's events in row order, or null when a non-blank row does not parse. */
function parseRows<R extends Row, E>(
  draft: string,
  toEvent: (row: R) => E | null,
): E[] | null {
  const out: E[] = [];
  for (const row of readRows<R>(draft)) {
    if (isBlank(row)) continue;
    const e = toEvent(row);
    if (!e) return null;
    out.push(e);
  }
  return out;
}

export const parsePrepaymentRows = (draft: string) =>
  parseRows(draft, toPrepayment);
export const parseRecastRows = (draft: string) => parseRows(draft, toRecast);

/** The draft row of the `index`-th non-blank row (an engine error's index), or null. */
export function draftRowOf(draft: string, index: number): number | null {
  let seen = -1;
  for (const [i, row] of readRows(draft).entries()) {
    if (!isBlank(row) && ++seen === index) return i;
  }
  return null;
}
