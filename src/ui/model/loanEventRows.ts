// The mortgage form's prepayment and recast rows (ADR 0116 §11). Pure. A draft keeps a
// list as one JSON string under its field name, so the form's dirty check and leave guard
// compare it like any other field. Blank rows are ignored. The form submits the other
// rows in the order shown; the engine sorts by date itself, so an engine error's `index`
// is a position among the non-blank rows (`draftRowOf` maps it back).
import { dateDraft, moneyDraft, parseDate, parseMoney } from "./formParse";
import type {
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

/** The rows of a list draft ("" ⇒ none). */
export function readRows<K extends EventListKind>(
  _kind: K,
  draft: string,
): Rows[K][] {
  return draft === "" ? [] : (JSON.parse(draft) as Rows[K][]);
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

const isBlank = (row: PrepaymentRow | RecastRow) =>
  "amount" in row
    ? [row.date, row.amount, row.fee].every((v) => v.trim() === "")
    : [row.date, row.value].every((v) => v.trim() === "");

function parsePrepayment(row: PrepaymentRow) {
  const fee = row.fee.trim() === "" ? undefined : parseMoney(row.fee);
  return {
    date: parseDate(row.date),
    amount: positive(row.amount),
    fee: fee === undefined || (fee !== null && !fee.isNegative()) ? fee : null,
  };
}

function parseRecast(row: RecastRow) {
  return {
    date: parseDate(row.date),
    value: row.mode === "maturity" ? parseDate(row.value) : positive(row.value),
  };
}

/** The cells of a row that do not parse, in column order ([] for a blank row). */
export function rowProblems<K extends EventListKind>(
  kind: K,
  row: Rows[K],
): string[] {
  if (isBlank(row)) return [];
  const cells: Record<string, unknown> =
    kind === "prepayments"
      ? parsePrepayment(row as PrepaymentRow)
      : parseRecast(row as RecastRow);
  return Object.entries(cells)
    .filter(([, v]) => v === null)
    .map(([k]) => k);
}

/** The prepayments of a draft in row order, or null when a non-blank row does not parse. */
export function parsePrepaymentRows(
  draft: string,
): MortgagePrepayment[] | null {
  const out: MortgagePrepayment[] = [];
  for (const row of readRows("prepayments", draft)) {
    if (isBlank(row)) continue;
    const { date, amount, fee } = parsePrepayment(row);
    if (!date || !amount || fee === null) return null;
    out.push({ date, amount, effect: row.effect, ...(fee ? { fee } : {}) });
  }
  return out;
}

/** The recasts of a draft in row order, or null when a non-blank row does not parse. */
export function parseRecastRows(draft: string): LoanRecast[] | null {
  const out: LoanRecast[] = [];
  for (const row of readRows("recasts", draft)) {
    if (isBlank(row)) continue;
    const date = parseDate(row.date);
    if (!date) return null;
    if (row.mode === "maturity") {
      const maturity = parseDate(row.value);
      if (!maturity) return null;
      out.push({ date, maturity });
    } else {
      const instalment = positive(row.value);
      if (!instalment) return null;
      out.push({ date, instalment });
    }
  }
  return out;
}

/** The draft row of the `index`-th non-blank row (an engine error's index), or null. */
export function draftRowOf(draft: string, index: number): number | null {
  const rows =
    draft === "" ? [] : (JSON.parse(draft) as (PrepaymentRow | RecastRow)[]);
  let seen = -1;
  for (const [i, row] of rows.entries()) {
    if (!isBlank(row) && ++seen === index) return i;
  }
  return null;
}
