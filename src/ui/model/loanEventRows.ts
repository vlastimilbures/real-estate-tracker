// The mortgage form's prepayment, recast and development-draw rows (ADR 0116 §11,
// ADR 0167). Pure. A draft keeps a
// list as one JSON string under its field name, so the form's dirty check and leave guard
// compare it like any other field. Blank rows are ignored. The form submits the other
// rows in the order shown; the engine sorts by date itself, so an engine error's `index`
// is a position among the non-blank rows (`draftRowOf` maps it back).
import { dateDraft, moneyDraft, parseDate, parseMoney } from "./formParse";
import type {
  Money,
  LoanRecast,
  MortgageDraw,
  MortgagePrepayment,
  PrepaymentEffect,
} from "../../engine";
import type { Decimal } from "../../lib/money";

export type EventListKind = "prepayments" | "recasts" | "draws";

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

/** A development-loan tranche drawn after the start (ADR 0167). */
export interface DrawRow {
  date: string;
  amount: string;
}

interface Rows {
  prepayments: PrepaymentRow;
  recasts: RecastRow;
  draws: DrawRow;
}

/** A new row's draft. */
export const BLANK_ROW: Rows = {
  prepayments: { date: "", amount: "", effect: "lowerInstalment", fee: "" },
  recasts: { date: "", mode: "maturity", value: "" },
  draws: { date: "", amount: "" },
};

type Row = PrepaymentRow | RecastRow | DrawRow;

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

export function drawsDraft(list?: MortgageDraw[]): string {
  return writeRows(
    (list ?? []).map((x): DrawRow => ({
      date: dateDraft(x.date),
      amount: moneyDraft(x.amount),
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

/** The text cells of a row (a select is never blank). */
const texts = (row: Row): string[] =>
  "effect" in row
    ? [row.date, row.amount, row.fee]
    : "mode" in row
      ? [row.date, row.value]
      : [row.date, row.amount];

const isBlank = (row: Row) => texts(row).every((v) => v.trim() === "");

/** True when a list draft has a row that is not blank. */
export function hasRows(draft: string): boolean {
  return readRows(draft).some((row) => !isBlank(row));
}

/** An optional fee: undefined when blank, null when not an amount of 0 or more. */
function parseFee(raw: string): Money | null | undefined {
  if (raw.trim() === "") return undefined;
  const fee = parseMoney(raw);
  return fee?.isNegative() ? null : fee;
}

/** Each cell parsed; null where it does not parse. */
function cells(row: Row): Record<string, unknown> {
  if ("effect" in row)
    return {
      date: parseDate(row.date),
      amount: positive(row.amount),
      fee: parseFee(row.fee),
    };
  if ("mode" in row)
    return {
      date: parseDate(row.date),
      value:
        row.mode === "maturity" ? parseDate(row.value) : positive(row.value),
    };
  return { date: parseDate(row.date), amount: positive(row.amount) };
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

function toDraw(row: DrawRow): MortgageDraw | null {
  const date = parseDate(row.date);
  const amount = positive(row.amount);
  return date && amount ? { date, amount } : null;
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
/** The tranches in row order (the engine does not depend on their order). */
export const parseDrawRows = (draft: string) => parseRows(draft, toDraw);

/**
 * The total loan the form shows under the drawdown schedule: the start draw plus every
 * tranche row that parses (ADR 0167). Display only; the saved block's total is the
 * engine's `scheduledPrincipal`. Null until the start draw is an amount above 0.
 */
export function drawdownTotal(
  startDraft: string,
  drawsDraft: string,
): { total: Decimal; tranches: number } | null {
  const start = positive(startDraft);
  if (!start) return null;
  const amounts = readRows<DrawRow>(drawsDraft)
    .map((row) => (isBlank(row) ? null : toDraw(row)))
    .filter((x): x is MortgageDraw => x !== null)
    .map((x) => x.amount);
  return {
    total: amounts.reduce<Decimal>((sum, a) => sum.plus(a), start),
    tranches: amounts.length,
  };
}

export type DrawWarning = "afterCompletion" | "sameDate";

/**
 * Soft warnings per draft row (ADR 0167 §3); they never block a save. A tranche dated
 * after the interest-only end re-amortizes the loan again; two tranches on one date are
 * added together. A row without a valid date gets none.
 */
export function drawWarnings(
  drawsDraft: string,
  completionDraft: string,
): DrawWarning[][] {
  const completion = parseDate(completionDraft);
  const dates = readRows<DrawRow>(drawsDraft).map((row) =>
    parseDate(row.date)?.getTime(),
  );
  return dates.map((t) => {
    if (t === undefined) return [];
    const out: DrawWarning[] = [];
    if (completion && t > completion.getTime()) out.push("afterCompletion");
    if (dates.filter((x) => x === t).length > 1) out.push("sameDate");
    return out;
  });
}

/** The draft row of the `index`-th non-blank row (an engine error's index), or null. */
export function draftRowOf(draft: string, index: number): number | null {
  let seen = -1;
  for (const [i, row] of readRows(draft).entries()) {
    if (!isBlank(row) && ++seen === index) return i;
  }
  return null;
}
