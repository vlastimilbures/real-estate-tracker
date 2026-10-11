// The projection-year grid: which year a date turns on in, and a schedule's months summed
// per projection year (SPEC §4.5). A leaf shared by the projection and the cash the owner
// pays outside it (./ownerCash).
import { ZERO, type Decimal } from "../lib/money";
import { firstGridMonthOnOrAfter, isOnOrBefore } from "./dates";
import type { AmortizationRow, Assumptions } from "./types";

/** Sum a schedule's months for projection year t (months (t-1)*12+1 .. t*12). */
export function yearSlice(schedule: AmortizationRow[], t: number) {
  const start = (t - 1) * 12;
  const end = t * 12;
  let interest = ZERO;
  let principal = ZERO;
  let drawn = ZERO;
  let refinanced = ZERO;
  let prepaid = ZERO;
  let prepaymentFees = ZERO;
  let balance = ZERO;
  let lastRate: Decimal | null = null;
  for (const row of schedule.slice(start, end)) {
    interest = interest.plus(row.interest);
    principal = principal.plus(row.principal);
    drawn = drawn.plus(row.drawn);
    refinanced = refinanced.plus(row.refinanced);
    prepaid = prepaid.plus(row.prepaid);
    prepaymentFees = prepaymentFees.plus(row.prepaymentFee);
    balance = row.endBalance;
    if (row.principal.plus(row.interest).isPositive()) {
      lastRate = row.ratePa;
    }
  }
  return {
    interest,
    principal,
    debtService: interest.plus(principal),
    drawn,
    refinanced,
    prepaid,
    prepaymentFees,
    balance,
    rate: lastRate,
  };
}

/**
 * 1-based baseDate grid month in which `date` first becomes active. Returns 1 when
 * `date ≤ baseDate` (already owned/let ⇒ active the whole horizon, so the seed keeps
 * 12 months/year and parity holds), else the first month grid point on/after it,
 * else horizon+1 (never active in-window).
 */
export function firstActiveGridMonth(
  date: Date,
  assumptions: Assumptions,
): number {
  const { baseDate, horizonYears } = assumptions;
  if (isOnOrBefore(date, baseDate)) return 1;
  return firstGridMonthOnOrAfter(baseDate, date, horizonYears * 12);
}

/**
 * Projection year-slice (1..horizon) containing `date`, matching where
 * `buildSchedule` first draws a future loan (first month grid point ≥ date).
 * Returns 0 when the date is on/before baseDate (already owned → no gating), and
 * horizon+1 when it falls beyond the horizon (property never appears): grid month
 * horizon·12 + 1 is in year horizon + 1.
 */
export function turnOnYear(date: Date, assumptions: Assumptions): number {
  if (isOnOrBefore(date, assumptions.baseDate)) return 0;
  return Math.ceil(firstActiveGridMonth(date, assumptions) / 12);
}
