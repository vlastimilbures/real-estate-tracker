// The engine's single date module. Pure: no system clock.
//
// Convention: every engine date is a date-only calendar day stored as a JS `Date` at
// UTC midnight. Build them only with `utc` / `isoDate` (or derive them with `edate` /
// `addYears`), and read them only through `getUTC*`, so results never depend on the
// host time zone or DST. Month arithmetic follows Excel EDATE (clamp to month end).
import type { IsoDate } from "./brands";

/** Build a UTC date from y/m/d (m is 1-based). The root IsoDate constructor. */
export function utc(year: number, month1: number, day: number): IsoDate {
  return new Date(Date.UTC(year, month1 - 1, day)) as IsoDate;
}

/** Parse an ISO `YYYY-MM-DD` string to a UTC date. */
export function isoDate(s: string): IsoDate {
  const [y, m, d] = s.split("-").map(Number) as [number, number, number];
  return utc(y, m, d);
}

/**
 * EDATE: add `months` calendar months, clamping the day to the target month's
 * last day (e.g. Jan 31 + 1mo → Feb 28/29), matching Excel EDATE.
 */
export function edate(date: Date, months: number): IsoDate {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth(); // 0-based
  const d = date.getUTCDate();
  const targetMonthIndex = m + months;
  const targetYear = y + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
  const lastDay = new Date(
    Date.UTC(targetYear, targetMonth + 1, 0),
  ).getUTCDate();
  return utc(targetYear, targetMonth + 1, Math.min(d, lastDay));
}

/** The calendar day before `date` (ADR 0099: a closed record ends the day before its
 *  successor starts; end dates are inclusive). */
export function dayBefore(date: Date): IsoDate {
  return utc(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate() - 1,
  );
}

/** Add whole years as EDATE(date, 12·years), so Feb 29 clamps to Feb 28. */
export function addYears(date: Date, years: number): IsoDate {
  return edate(date, years * 12);
}

/**
 * The first month grid point on or after `date`: the smallest m in [1, limit] with
 * EDATE(anchor, m) ≥ date, or `limit + 1` when there is none. Always ≥ 1, even when
 * `date` is on or before `anchor`; callers apply their own "already running" rule.
 * The single "first grid month" scan behind loan draws, turn-on years and tranches.
 */
export function firstGridMonthOnOrAfter(
  anchor: Date,
  date: Date,
  limit = Infinity,
): number {
  for (let m = 1; m <= limit; m++) {
    if (!isAfter(date, edate(anchor, m))) return m;
  }
  return limit + 1;
}

/**
 * The last month grid point on or before `date`: the number of k ≥ 1 with
 * EDATE(anchor, k) ≤ date (0 when there is none). With a loan's start as the anchor
 * this is the number of payments due by `date` (D-21): unlike `monthsBetween`, a
 * clamped month-end due date counts (start 31 Jan → due 28 Feb, DR-070).
 */
export function lastGridMonthOnOrBefore(anchor: Date, date: Date): number {
  // EDATE(anchor, k) is non-decreasing in k and within a month-end clamp of
  // monthsBetween, so a ±1 correction from it is exact.
  let k = Math.max(0, monthsBetween(anchor, date));
  while (!isAfter(edate(anchor, k + 1), date)) k++;
  while (k > 0 && isAfter(edate(anchor, k), date)) k--;
  return k;
}

/**
 * Whole completed months from `a` to `b` (b >= a). Counts a month only when the
 * day-of-month has been reached, e.g. 2021-01-17 → 2026-06-07 = 64 (not 65),
 * because the 7th precedes the 17th.
 */
export function monthsBetween(a: Date, b: Date): number {
  let months =
    (b.getUTCFullYear() - a.getUTCFullYear()) * 12 +
    (b.getUTCMonth() - a.getUTCMonth());
  if (b.getUTCDate() < a.getUTCDate()) months -= 1;
  return months;
}

/** True if `a` is strictly after `b`. */
export function isAfter(a: Date, b: Date): boolean {
  return a.getTime() > b.getTime();
}

/** True if `a` is on or before `b`. */
export function isOnOrBefore(a: Date, b: Date): boolean {
  return a.getTime() <= b.getTime();
}

/**
 * Effective-dating selector: the latest item whose start ≤ `asOf` and — when an
 * `getEnd` accessor is supplied — whose end is blank or ≥ `asOf`. This is the single
 * expression of "the record in force at a date" (CLAUDE.md §4); valuation, lease, and
 * mortgage-block selectors all compose on it.
 */
export function lastOnOrBefore<T>(
  items: T[],
  asOf: Date,
  getStart: (x: T) => Date,
  getEnd?: (x: T) => Date | undefined,
): T | undefined {
  return items
    .filter((x) => {
      if (!isOnOrBefore(getStart(x), asOf)) return false;
      if (!getEnd) return true;
      const end = getEnd(x);
      return end === undefined || isOnOrBefore(asOf, end);
    })
    .sort(byStart(getStart))
    .at(-1);
}

/**
 * "The record governing a date": the one in force at `asOf` (see `lastOnOrBefore`),
 * else the nearest upcoming one. The mortgage-block fallback (a recorded future record
 * beats a stale default). Valuations add a tier between the two (`selectValuation`,
 * ADR 0122).
 */
export function inForceOrUpcoming<T>(
  items: T[],
  asOf: Date,
  getStart: (x: T) => Date,
  getEnd?: (x: T) => Date | undefined,
): T | undefined {
  return (
    lastOnOrBefore(items, asOf, getStart, getEnd) ??
    firstAfter(items, asOf, getStart)
  );
}

/**
 * Ascending by start date. `Array.prototype.sort` is stable, so records with the same
 * start keep their input order: `lastOnOrBefore` picks the last of them and
 * `firstAfter` the first (DR-071 — documented, not validated).
 */
function byStart<T>(getStart: (x: T) => Date) {
  return (a: T, b: T) => getStart(a).getTime() - getStart(b).getTime();
}

/** The earliest item whose start is strictly after `asOf` (the nearest upcoming one). */
export function firstAfter<T>(
  items: T[],
  asOf: Date,
  getStart: (x: T) => Date,
): T | undefined {
  return items
    .filter((x) => isAfter(getStart(x), asOf))
    .sort(byStart(getStart))
    .at(0);
}
