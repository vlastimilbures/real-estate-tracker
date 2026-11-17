// The input rules every entry point shares, each named once (#464): the bounded field
// ranges (ADR 0075, DR-078) the forms (src/ui/model), CSV import (src/import, ADR 0076)
// and restore apply, so all refuse the same values, and the date floor. Every bounded
// field is a whole number except the size, which takes one decimal place (ADR 0236).
// A layer whose limit differs gets its own named rule here, never a silent shared one.

/** Inclusive bounds of a bounded field. */
export interface IntRange {
  min: number;
  max: number;
}

/** The bounded field ranges (ADR 0075, DR-078). */
export const INT_RANGES = {
  horizonYears: { min: 1, max: 100 },
  fixationYears: { min: 0, max: 50 },
  loanTermYears: { min: 1, max: 50 },
  sizeM2: { min: 1, max: 10_000 },
} as const satisfies Record<string, IntRange>;

/** A shock's years and the crash year reach at most the longest horizon (ADR 0140 §4):
 *  the scenario form's bounds. */
export const SHOCK_YEARS = {
  min: 1,
  max: INT_RANGES.horizonYears.max,
} as const satisfies IntRange;
export const CRASH_YEAR = {
  min: 0,
  max: INT_RANGES.horizonYears.max,
} as const satisfies IntRange;

/** A whole, unsigned number of at most 9 plain digits, as the forms and CSV import take
 *  it (ADR 0075, DR-027, DR-078): a longer entry is refused instead of becoming
 *  Infinity, and 12.7, -3, 1e2 and 0x10 are refused. */
export const WHOLE_DIGITS = /^\d{1,9}$/;

/** New dates start on 01.01.1900 (ADR 0149 §5, DR-035, UX-052): the forms and CSV import
 *  refuse an earlier one, which is almost certainly a typo. A stored one is not checked
 *  (ADR 0232). */
export const DATE_FLOOR_YEAR = 1900;

export const inRange = (n: number, r: IntRange): boolean =>
  n >= r.min && n <= r.max;

/** At most one decimal place: the size's precision (ADR 0236 §1). */
export const oneDecimal = (v: number): boolean => Number(v.toFixed(1)) === v;

/** The same rule on entered text with a `.` decimal point, counted by value: trailing
 *  zeros do not count, so the 54.50 a two-decimal spreadsheet column exports is one
 *  decimal place (ADR 0236). */
export function oneDecimalText(text: string): boolean {
  const fraction = text.split(".")[1] ?? "";
  return fraction.replace(/0+$/, "").length <= 1;
}

/** Above this many times a field's form maximum a stored value is not plausible data but
 *  a broken file: restore refuses it, where up to it restore only asks (ADR 0148). It also
 *  keeps a hand-edited horizon or term from making every projection loop for ever. */
export const HARD_LIMIT_FACTOR = 10;

/** A bounded field and where it is stored. */
export type BoundedField = keyof typeof INT_RANGES;

/** One stored value outside INT_RANGES, or finer than its field accepts: not a whole
 *  number (ADR 0180 §2), or for the size more than one decimal place (ADR 0236). */
export interface OutOfRangeField {
  entity: "assumptions" | "property" | "mortgage";
  id: string | undefined;
  field: BoundedField;
  value: number;
  range: IntRange;
  /** Above HARD_LIMIT_FACTOR × the form maximum. */
  beyondLimit: boolean;
}

/** Every bounded field outside INT_RANGES or finer than the forms accept, as the forms
 *  refuse both (ADR 0180 §2; the size takes one decimal place, ADR 0236; unset optional
 *  fields pass).
 *  Structural types: lib never imports the engine, whose Portfolio and Assumptions fit. */
export function outOfRangeFields(
  portfolio: {
    properties: readonly { id: string; sizeM2?: number | undefined }[];
    mortgages: readonly {
      id: string;
      fixationYears: number;
      loanTermYears?: number | undefined;
    }[];
  },
  assumptions?: { horizonYears: number },
): OutOfRangeField[] {
  const out: OutOfRangeField[] = [];
  const check = (
    entity: OutOfRangeField["entity"],
    id: string | undefined,
    field: BoundedField,
    value: number | undefined,
  ) => {
    const range = INT_RANGES[field];
    const precise = field === "sizeM2" ? oneDecimal : Number.isInteger;
    if (value !== undefined && (!precise(value) || !inRange(value, range)))
      out.push({
        entity,
        id,
        field,
        value,
        range,
        beyondLimit: value > range.max * HARD_LIMIT_FACTOR,
      });
  };
  if (assumptions)
    check("assumptions", undefined, "horizonYears", assumptions.horizonYears);
  for (const p of portfolio.properties)
    check("property", p.id, "sizeM2", p.sizeM2);
  for (const m of portfolio.mortgages) {
    check("mortgage", m.id, "fixationYears", m.fixationYears);
    check("mortgage", m.id, "loanTermYears", m.loanTermYears);
  }
  return out;
}
