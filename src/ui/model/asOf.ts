// The As-of picker's window and presets (UX-059, D-19): snapshots exist from the base
// date (the projection start) to the end of the horizon, and "+N years" steps like the
// engine's EDATE, so 29 Feb + 1 year is 28 Feb (DR-072). Pure.
import { addYears } from "../../engine";

export interface AsOfBounds {
  min: Date;
  max: Date;
}

/** The dates a snapshot can be taken at: base date … base date + horizon years. */
export function asOfBounds(baseDate: Date, horizonYears: number): AsOfBounds {
  return { min: baseDate, max: addYears(baseDate, horizonYears) };
}

/** `d` moved into the window (the nearest end when outside). */
export function clampAsOf(d: Date, b: AsOfBounds): Date {
  if (d.getTime() < b.min.getTime()) return b.min;
  if (d.getTime() > b.max.getTime()) return b.max;
  return d;
}

/** A "+N years" preset from `anchor`. */
export function plusYears(anchor: Date, years: number): Date {
  return addYears(anchor, years);
}

/** The as-of date a page computes for (ADR 0150): the picked date, or today when none is
 *  picked, moved into the window; it is Today only when that date is today. */
export interface ResolvedAsOf {
  date: Date;
  isToday: boolean;
}

/** The one as-of resolver (ADR 0150): every page and the engine call read its date. */
export function resolveAsOf(
  picked: Date | null,
  today: Date,
  b: AsOfBounds,
): ResolvedAsOf {
  const date = clampAsOf(picked ?? today, b);
  return { date, isToday: date.getTime() === today.getTime() };
}
