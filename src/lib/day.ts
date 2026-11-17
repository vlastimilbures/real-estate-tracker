// Calendar days at the UI boundary (ADR 0149). The engine is pure (no Date.now) and keeps
// every day as a Date at UTC midnight; "now", a picked calendar cell and a backup time
// stamp are local moments. Each crossing between the two goes through this module, so a
// time-zone fix is made once (DR-068, DR-072).
import { DATE_FLOOR_YEAR } from "./rules";

// The full-year builders. Date.UTC and `new Date(y, m, d)` map years 0–99 to 1900–1999.
// These are lib's twin of the engine's `utc()` (lib never imports the engine), one
// constructor per layer (ADR 0149 §5). month0 is 0-based.
function utcMidnight(year: number, month0: number, day: number): Date {
  const date = new Date(0);
  date.setUTCFullYear(year, month0, day);
  return date;
}
function localMidnightOf(year: number, month0: number, day: number): Date {
  // Time first: the epoch can be a local hour a DST gap skips on the target day (23:00
  // in Atlantic/Azores), which would roll the date into the next day.
  const date = new Date(0);
  date.setHours(0, 0, 0, 0);
  date.setFullYear(year, month0, day);
  return date;
}

/** The local calendar day of `instant`, at UTC midnight (the engine's convention). */
export function localDay(instant: Date): Date {
  return utcMidnight(
    instant.getFullYear(),
    instant.getMonth(),
    instant.getDate(),
  );
}

/** The inverse of `localDay`: a UTC-midnight day as local midnight of the same day, for
 *  widgets that work in local time (the calendar popover). */
export function localMidnight(day: Date): Date {
  return localMidnightOf(
    day.getUTCFullYear(),
    day.getUTCMonth(),
    day.getUTCDate(),
  );
}

/** A UTC-midnight day as YYYY-MM-DD; a year below 1000 is padded (ADR 0178). */
export function isoDay(day: Date): string {
  const yyyy = String(day.getUTCFullYear()).padStart(4, "0");
  const mm = String(day.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(day.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** Today: the local calendar day of `now`. The UI-boundary clock; `now` is injectable for
 *  tests (DR-072). */
export function todayUtc(now: Date = new Date()): Date {
  return localDay(now);
}

/** The local calendar day of `now` as YYYY-MM-DD, for file names (DR-068): a backup
 *  saved at 00:30 in Prague is dated today, not yesterday (UTC). */
export function localIsoDay(now: Date = new Date()): string {
  return isoDay(localDay(now));
}

/** The date floor (`DATE_FLOOR_YEAR` in ./rules) as a UTC-midnight day, for messages that
 *  name it. */
export const DATE_FLOOR: Date = utcMidnight(DATE_FLOOR_YEAR, 0, 1);
