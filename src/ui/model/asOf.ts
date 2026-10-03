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
