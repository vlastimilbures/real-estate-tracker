// Runtime guards at the DB → engine boundary (D-48, DR-037). Hand-rolled, no schema
// library. They check SHAPE only: a stored value can be read as what its column holds
// (a finite decimal string, a real calendar date, a number). VALUE rules (ranges,
// end ≥ start, loan sanity) stay with the engine's validateInputs, which raises at
// every entry point (D-37/D-38) — they are not duplicated here.
//
// A failure throws DataError("ROW_INVALID") naming table, row id and column — never the
// value, so the error is safe to log.
import { D, type Decimal } from "../lib/money";
import { PLAIN_DECIMAL } from "../lib/decimalText";
import {
  calendarDay,
  isoDate,
  money,
  rate,
  type IsoDate,
  type Money,
  type Rate,
} from "../engine";
import { DataError } from "./errors";

/** Which row is being read, for the error message. */
export interface RowRef {
  table: string;
  id: string;
}

function invalid(ref: RowRef, column: string, problem: string): never {
  const line = `${ref.table} ${ref.id}: ${column} ${problem}`;
  throw new DataError(
    "ROW_INVALID",
    `A saved record cannot be read: ${line}.`,
    [line],
  );
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The earliest year a stored date may have. The guard checks shape only, so this is not
 *  the forms' 1900 floor: a database holding an earlier date keeps loading (ADR 0149 §5). */
const STORED_MIN_YEAR = 100;

/** True for a real calendar date in ISO yyyy-mm-dd form (no 2026-02-31 roll-over) from
 *  year 0100 on. */
export function isIsoDate(v: string): boolean {
  const m = ISO_DATE.exec(v);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return y >= STORED_MIN_YEAR && calendarDay(y, mo, d) !== null;
}

/** The exponent form decimal.js `toString()` writes for very small or large values
 *  (`1e-7`, `-1.5e-7`, `1e+21`): one leading digit and a signed exponent. */
const WRITTEN_EXPONENT = /^-?[1-9](\.\d+)?e[+-]\d+$/;

/** A finite decimal parsed from text: plain notation (the CSV grammar) or the exponent
 *  form the app itself writes (ADR 0148). D() alone would also take `0x10`, `1_000`,
 *  `+5`, `1e3`, "NaN" and "Infinity"; we do not. */
export function parseDecimalText(v: unknown): Decimal | null {
  if (typeof v !== "string") return null;
  if (!PLAIN_DECIMAL.test(v) && !WRITTEN_EXPONENT.test(v)) return null;
  try {
    const d = D(v);
    return d.isFinite() ? d : null;
  } catch {
    return null;
  }
}

export function decimal(ref: RowRef, column: string, v: unknown): Decimal {
  const d = parseDecimalText(v);
  return d ?? invalid(ref, column, "is not a finite decimal number");
}

export function moneyText(ref: RowRef, column: string, v: unknown): Money {
  return money(decimal(ref, column, v));
}

export function moneyOpt(
  ref: RowRef,
  column: string,
  v: unknown,
): Money | undefined {
  return v == null ? undefined : moneyText(ref, column, v);
}

export function rateText(ref: RowRef, column: string, v: unknown): Rate {
  return rate(decimal(ref, column, v));
}

export function rateOpt(
  ref: RowRef,
  column: string,
  v: unknown,
): Rate | undefined {
  return v == null ? undefined : rateText(ref, column, v);
}

export function date(ref: RowRef, column: string, v: unknown): IsoDate {
  if (typeof v !== "string" || !isIsoDate(v))
    invalid(ref, column, "is not a valid yyyy-mm-dd date");
  return isoDate(v);
}

export function dateOpt(
  ref: RowRef,
  column: string,
  v: unknown,
): IsoDate | undefined {
  return v == null ? undefined : date(ref, column, v);
}

export function num(ref: RowRef, column: string, v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v))
    invalid(ref, column, "is not a number");
  return v;
}

export function numOpt(
  ref: RowRef,
  column: string,
  v: unknown,
): number | undefined {
  return v == null ? undefined : num(ref, column, v);
}

export function text(ref: RowRef, column: string, v: unknown): string {
  if (typeof v !== "string") invalid(ref, column, "is not text");
  return v;
}
