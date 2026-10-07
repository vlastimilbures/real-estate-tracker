// Calendar days at the UI boundary (ADR 0149). The engine is pure (no Date.now) and keeps
// every day as a Date at UTC midnight; "now", a picked calendar cell and a backup time
// stamp are local moments. Each crossing between the two goes through this module, so a
// time-zone fix is made once (DR-068, DR-072).

// The full-year builders. Date.UTC and `new Date(y, m, d)` map years 0–99 to 1900–1999.
// These are lib's twin of the engine's `utc()` (lib never imports the engine), one
// constructor per layer (ADR 0149 §5). month0 is 0-based.
function utcMidnight(year: number, month0: number, day: number): Date {
  const date = new Date(0);
  date.setUTCFullYear(year, month0, day);
  return date;
}
function localMidnightOf(year: number, month0: number, day: number): Date {
  const date = new Date(0);
  date.setFullYear(year, month0, day);
  date.setHours(0, 0, 0, 0);
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

/** A UTC-midnight day as YYYY-MM-DD. */
export function isoDay(day: Date): string {
  const mm = String(day.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(day.getUTCDate()).padStart(2, "0");
  return `${day.getUTCFullYear()}-${mm}-${dd}`;
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
