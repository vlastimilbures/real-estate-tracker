// Whole-number field bounds (ADR 0075, DR-078), shared by the forms (src/ui/model) and
// CSV import (src/import, ADR 0076) so both refuse the same values.

/** Inclusive bounds of a whole-number field. */
export interface IntRange {
  min: number;
  max: number;
}

/** The whole-number field bounds (ADR 0075, DR-078). */
export const INT_RANGES = {
  horizonYears: { min: 1, max: 100 },
  fixationYears: { min: 0, max: 50 },
  loanTermYears: { min: 1, max: 50 },
  sizeM2: { min: 1, max: 10_000 },
} as const satisfies Record<string, IntRange>;

export const inRange = (n: number, r: IntRange): boolean =>
  n >= r.min && n <= r.max;
