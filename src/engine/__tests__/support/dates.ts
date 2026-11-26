// Dates in test assertions (#458).

/** A date as its UTC `yyyy-mm-dd`; a missing date (null or undefined) is passed through
 *  as it came. */
export function isoOf(d: Date): string;
export function isoOf(d: Date | null): string | null;
export function isoOf(d: Date | undefined): string | undefined;
export function isoOf(d: Date | null | undefined): string | null | undefined {
  return d ? d.toISOString().slice(0, 10) : d;
}
