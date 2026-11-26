// The engine's year/month conversions: the one place an annual rate becomes a monthly one
// and years become months (or months years). Each is the plain `* 12` or `/ 12` it
// replaced, so no number moves.
import type { Decimal } from "../lib/money";

export const MONTHS_PER_YEAR = 12;

/** The monthly rate of an annual one: ratePa / 12 (the nominal monthly rate, SPEC §4.4). */
export function monthlyRate(ratePa: Decimal): Decimal {
  return ratePa.div(MONTHS_PER_YEAR);
}

/** Months in `years` years (a whole count for whole years). */
export function yearsToMonths(years: number): number {
  return years * MONTHS_PER_YEAR;
}

/** Years in `months` months, fractional (callers round when they need a year index). */
export function monthsToYears(months: number): number {
  return months / MONTHS_PER_YEAR;
}
