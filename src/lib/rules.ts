// The input rules every entry point shares, each named once: the bounded field ranges
// (ADR 0075) the forms (src/ui/model), CSV import (src/import, ADR 0076) and restore
// apply, so all refuse the same values, and the date floor. Every bounded field is a
// whole number except the size, which takes one decimal place (ADR 0236). A layer whose
// limit differs gets its own named rule here, never a silent shared one. The engine reads
// this module (ADR 0244), so it imports nothing but ./money: no clock, no display code.
import { ONE, type Decimal } from "./money";

/** Inclusive bounds of a bounded field. */
export interface IntRange {
  min: number;
  max: number;
}

/** The bounded field ranges (ADR 0075). */
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
 *  it (ADR 0075): a longer entry is refused instead of becoming Infinity, and 12.7, -3,
 *  1e2 and 0x10 are refused. */
export const WHOLE_DIGITS = /^\d{1,9}$/;

/** New dates start on 01.01.1900 (ADR 0149 §5): the forms and CSV import refuse an
 *  earlier one, which is almost certainly a typo. A stored one is not checked
 *  (ADR 0232). */
export const DATE_FLOOR_YEAR = 1900;

export const inRange = (n: number, r: IntRange): boolean =>
  n >= r.min && n <= r.max;

/** A unit rate is a fraction from 0 to 1 (ADR 0038, ADR 0128 §1): vacancy, cost shares,
 *  an interest rate, a value haircut. Negative zero is outside, as `Decimal.isNegative`
 *  says (the engine and CSV import have always refused it). Finite values only: a
 *  non-finite one is each layer's own rule. */
export const outsideUnitRate = (d: Decimal): boolean =>
  d.isNegative() || d.greaterThan(ONE);

/** The growth floor, −100 % (ADR 0128 §2): a yearly factor of zero or less. */
const GROWTH_FLOOR = ONE.negated();

/** A growth rate at or below the floor. Finite values only, as `outsideUnitRate`. */
export const atOrBelowGrowthFloor = (d: Decimal): boolean =>
  d.lessThanOrEqualTo(GROWTH_FLOOR);

/** At most one decimal place: the size's precision (ADR 0236 §1). */
const oneDecimal = (v: number): boolean => Number(v.toFixed(1)) === v;

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
const HARD_LIMIT_FACTOR = 10;

/** A bounded field and where it is stored. */
export type BoundedField = keyof typeof INT_RANGES;

/** One stored value outside INT_RANGES, or finer than its field accepts: not a whole
 *  number (ADR 0180 §2), or for the size more than one decimal place (ADR 0236). The one
 *  shape restore, the store and the Data check read.
 *  Not an engine rule: the engine itself is open-ended. A restore warns and asks instead
 *  of refusing (ADR 0148); the store refuses only a value a write adds (ADR 0245). */
export interface RangeProblem {
  /** BEYOND_LIMIT: above HARD_LIMIT_FACTOR × the form maximum, so restore refuses
   *  (ADR 0148). */
  code: "OUT_OF_RANGE" | "BEYOND_LIMIT";
  entity: "assumptions" | "property" | "mortgage";
  id: string | undefined;
  field: BoundedField;
  /** The stored value: the Data check names it; restore never shows it (ADR 0086). */
  value: number;
  range: IntRange;
}

/** A scenario's shock or crash year outside the scenario form's bounds (ADR 0257 §1):
 *  the store refuses one a write adds. Its own type: the Data check and restore read
 *  RangeProblem only. `field` is the scenario form's, as RangeProblem's is the other
 *  forms' (ADR 0245 §5). */
export interface ScenarioRangeProblem {
  code: "OUT_OF_RANGE";
  entity: "scenario";
  field: "inflationShockYears" | "rateShockYears" | "valueShockYear";
  value: number;
  range: IntRange;
}

/** Every bounded field outside INT_RANGES or finer than the forms accept, as the forms
 *  refuse both (ADR 0180 §2; the size takes one decimal place, ADR 0236; unset optional
 *  fields pass).
 *  Structural types: lib never imports the engine, whose Portfolio and Assumptions fit. */
export function rangeProblems(
  portfolio: {
    properties: readonly { id: string; sizeM2?: number | undefined }[];
    mortgages: readonly {
      id: string;
      fixationYears: number;
      loanTermYears?: number | undefined;
    }[];
  },
  assumptions?: { horizonYears: number },
): RangeProblem[] {
  const out: RangeProblem[] = [];
  const check = (
    entity: RangeProblem["entity"],
    id: string | undefined,
    field: BoundedField,
    value: number | undefined,
  ) => {
    const range = INT_RANGES[field];
    const precise = field === "sizeM2" ? oneDecimal : Number.isInteger;
    if (value !== undefined && (!precise(value) || !inRange(value, range)))
      out.push({
        code:
          value > range.max * HARD_LIMIT_FACTOR
            ? "BEYOND_LIMIT"
            : "OUT_OF_RANGE",
        entity,
        id,
        field,
        value,
        range,
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

const keyOf = (p: RangeProblem) => `${p.entity}|${p.id ?? ""}|${p.field}`;

/** The problems of `after` that `before` does not have with the same value: new ones,
 *  and stored ones the write changes. The store (ADR 0245) and the CSV import plan
 *  (ADR 0257 §2) refuse these. */
export function rangeProblemsAddedBy(
  before: readonly RangeProblem[],
  after: readonly RangeProblem[],
): RangeProblem[] {
  const stored = new Map(before.map((p) => [keyOf(p), p.value]));
  return after.filter((p) => {
    const key = keyOf(p);
    return !stored.has(key) || !Object.is(stored.get(key), p.value);
  });
}
