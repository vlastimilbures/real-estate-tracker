// The test clock (#458). Every test starts on PINNED_DAY (src/__tests__/setup/clock.ts),
// so "today" never depends on the day the suite runs. A test that needs another day calls
// `setClock`; one that needs an exact instant (a minute before midnight) still uses
// `vi.setSystemTime`.
import { vi } from "vitest";

/** The day every test starts on (YYYY-MM-DD). */
export const PINNED_DAY = "2026-10-01";

/** Set the clock to local noon of `iso` (YYYY-MM-DD). A DST jump never moves noon to
 *  another day, so `todayUtc()` and `localIsoDay()` return `iso` in every time zone.
 *  `Date` only, and it stands still; timers stay real. A file's own `vi.useFakeTimers()`
 *  starts from this instant, and its `vi.useRealTimers()` returns the real clock until the
 *  next test. */
export function setClock(iso: string): void {
  const [, year, month, day] = (
    /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso) ?? []
  ).map(Number);
  const noon = new Date(year ?? NaN, (month ?? NaN) - 1, day ?? NaN, 12);
  if (noon.getDate() !== day || noon.getMonth() + 1 !== month)
    throw new Error(`setClock: "${iso}" is not a YYYY-MM-DD day`);
  vi.setSystemTime(noon);
}
