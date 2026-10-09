// Pure parse/format helpers for draft strings ⇄ engine types. Kept out of the form
// component file so fast-refresh stays happy and the parsing is unit-testable.
import { D, type Decimal } from "../../lib/money";
import { fmtCzk, fmtDate } from "../../lib/format";
import { inRange, type IntRange } from "../../lib/intRanges";
import { DATE_FLOOR_YEAR } from "../../lib/day";
import {
  calendarDay,
  money,
  rate,
  type IsoDate,
  type LoanRecast,
  type Money,
  type MortgageDraw,
  type MortgagePrepayment,
  type Rate,
} from "../../engine";
import type { Dictionary } from "../../i18n";

/** Accept "1 234 567,89" or "1234567.89" → Decimal. */
export function parseDecimal(raw: string): Decimal | null {
  const cleaned = raw.replace(/\s/g, "").replace(",", ".");
  if (cleaned === "" || !/^-?\d*\.?\d+$/.test(cleaned)) return null;
  try {
    return D(cleaned);
  } catch {
    return null;
  }
}

/** An English thousands separator: `450,000`, `1.250`, `1 250,000` (ADR 0140). The group
 *  space is mandatory and the first digit is not 0, so `1000.005` and `0.005` are amounts. */
const THOUSANDS_SHAPE = /^-?[1-9]\d{0,2}(?:\s+\d{3})*[.,]\d{3}$/;

/** Money entry → Money (sign kept; callers decide whether negatives are allowed). A
 *  thousands-shaped entry is refused: read as decimals it is 1000× too small. */
export function parseMoney(raw: string): Money | null {
  if (THOUSANDS_SHAPE.test(raw.trim())) return null;
  const d = parseDecimal(raw);
  return d === null ? null : money(d);
}

/** Percent entry: user types "4.5" (%) → ratio 0.045. */
export function parsePercentToRatio(raw: string): Rate | null {
  const d = parseDecimal(raw);
  return d === null ? null : rate(d.div(100));
}

/** Whole, unsigned, at most 9 digits like CSV import (ADR 0075, DR-078): a longer entry
 *  is rejected instead of becoming Infinity. */
export function parseIntField(raw: string): number | null {
  const cleaned = raw.replace(/\s/g, "");
  if (!/^\d{1,9}$/.test(cleaned)) return null;
  return Number(cleaned);
}

/** dd.mm.yyyy → UTC Date (or null). */
export function parseDate(raw: string): IsoDate | null {
  const m = raw.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const year = Number(yyyy);
  // New dates start on 01.01.1900; earlier is almost certainly a typo (ADR 0149 §5,
  // DR-035, UX-052).
  if (year < DATE_FLOOR_YEAR) return null;
  return calendarDay(year, Number(mm), Number(dd)); // UTC midnight, no roll-over
}

// draft formatters (Decimal/Date → editable string)
/** The stored precision, never rounded or in exponent form: a form saves the record it
 *  shows, so a rounded draft would rewrite an amount nobody touched (ADR 0131, #201). */
export function moneyDraft(d: Decimal | undefined): string {
  return d == null ? "" : d.toFixed();
}
/** A stored ratio as its exact percentage, for the same reason (ADR 0131, #208): the
 *  `times(100)` and the parse's `div(100)` are exact at Decimal precision. */
export function percentDraft(d: Decimal | undefined): string {
  return d == null ? "" : d.times(100).toFixed();
}
export function dateDraft(date: Date | undefined): string {
  return date ? fmtDate(date) : "";
}

// ---- field specs + kind parsing -------------------------------------------

export type FieldKind =
  "date" | "money" | "pct" | "int" | "draws" | "prepayments" | "recasts";

export interface FieldSpec {
  name: string;
  label: string;
  kind: FieldKind;
  optional?: boolean;
  suffix?: string;
  help?: string;
  /** Bounds of an `int` field; a parsed value outside them is invalid. */
  range?: IntRange;
  /** A row list's fixed first row (ADR 0167): another spec's money field shown as the
   *  list's first row, dated by a date field it mirrors read-only. Hide that spec from
   *  the grid while the list shows. */
  lead?: LeadRow;
}

export interface LeadRow {
  field: string;
  dateField: string;
  label: string;
  /** Shown in place of the date while the date field is blank. */
  dateFallback: string;
}

/** The message for a value that does not parse: the expected format of its kind (UX-040). */
export function invalidHint(
  t: Pick<Dictionary, "forms">,
  kind: FieldKind,
): string {
  return t.forms.invalidHint[kind];
}

/** "Enter a whole number from 1 to 10 000" (UX-068). */
export function intRangeHint(
  t: Pick<Dictionary, "forms">,
  r: IntRange,
): string {
  const n = (v: number) => fmtCzk(v, { suffix: false });
  return t.forms.intRange(n(r.min), n(r.max));
}

/** A field's invalid-value message: its range when bounded, else its kind's format. */
export function fieldHint(
  t: Pick<Dictionary, "forms">,
  spec: Pick<FieldSpec, "kind" | "range">,
): string {
  return spec.range ? intRangeHint(t, spec.range) : invalidHint(t, spec.kind);
}

/** The value each field kind parses to. */
export interface KindValue {
  date: IsoDate;
  money: Money;
  pct: Rate;
  int: number;
  draws: MortgageDraw[];
  /** Row-editor lists (ADR 0116): a JSON draft, see loanEventRows.ts. */
  prepayments: MortgagePrepayment[];
  recasts: LoanRecast[];
}

/** Any one parsed field value; null = an optional field left blank. */
export type ParsedValue = KindValue[FieldKind] | null;

/** One spec's parsed value: its kind's type, plus null when the spec has an `optional`
 *  flag that is not literally false (a plain FieldSpec may be optional, so it gets null). */
type SpecValue<F extends FieldSpec> =
  | KindValue[F["kind"]]
  | ("optional" extends keyof F
      ? F extends { optional: false }
        ? never
        : null
      : never);

/** A form's parsed values, keyed and typed by its field specs. Declare the specs inline
 *  (or `as const`) so their names, kinds and `optional: true` stay literal. */
export type ParsedValues<S extends readonly FieldSpec[]> = {
  [F in S[number] as F["name"]]: SpecValue<F>;
};

/** A parser per field kind: the value, or null when the text does not parse. */
export type KindParsers = {
  [K in FieldKind]: (raw: string) => KindValue[K] | null;
};

/** How a form parses: its kind parsers and the messages for blank and invalid fields. */
export interface CollectRules {
  parsers: KindParsers;
  /** Message for a required field left blank (optional blanks parse to null). */
  blank: (spec: FieldSpec) => string;
  /** Message for text that does not parse as the field's kind. */
  invalid: (spec: FieldSpec) => string;
}

/**
 * Parse a draft (field name → text) into values typed by the specs. Text is trimmed; a
 * blank optional field is null; any blank required or unparseable field gets an error
 * instead of a value.
 */
export function collectValues<const S extends readonly FieldSpec[]>(
  specs: S,
  draft: Readonly<Record<string, string>>,
  rules: CollectRules,
): { values: ParsedValues<S>; errors: Record<string, string> } {
  const values: Record<string, ParsedValue> = {};
  const errors: Record<string, string> = {};
  for (const spec of specs) {
    const raw = (draft[spec.name] ?? "").trim();
    if (raw === "") {
      if (spec.optional) values[spec.name] = null;
      else errors[spec.name] = rules.blank(spec);
      continue;
    }
    const parsed = rules.parsers[spec.kind](raw);
    const outside =
      spec.range && typeof parsed === "number" && !inRange(parsed, spec.range);
    if (parsed === null || outside) errors[spec.name] = rules.invalid(spec);
    else values[spec.name] = parsed;
  }
  // Every value came from its own spec's kind parser, and null only from an optional
  // blank, so the record has the ParsedValues<S> shape (read only when errors is empty).
  return { values: values as ParsedValues<S>, errors };
}
