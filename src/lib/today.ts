// UI-boundary clock. The engine is pure (no Date.now); "today" is resolved here
// and passed in. Normalized to UTC midnight so it lines up with the engine's
// UTC calendar-date arithmetic.
// `now` is injectable for tests (DR-072).
export function todayUtc(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

/** The local calendar day of `now` as YYYY-MM-DD, for file names (DR-068): a backup
 *  saved at 00:30 in Prague is dated today, not yesterday (UTC). */
export function localIsoDay(now: Date = new Date()): string {
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${mm}-${dd}`;
}
