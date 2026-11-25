// The rate a loan block pays (SPEC §4.4): its fixation end and the fixation- and
// shock-aware rate in force on a payment's due date (D-21, ADR 0162).
import type { Decimal } from "../lib/money";
import { edate, isAfter, isOnOrBefore } from "./dates";
import type { Assumptions, IsoDate, MortgageBlock } from "./types";

/** End of the fixation period: startDate + fixationYears*12 months (EDATE). */
export function blockEndDate(block: MortgageBlock): IsoDate {
  return edate(block.startDate, block.fixationYears * 12);
}

/**
 * The last date the entered rate applies: the fixation end, or for a 0-year (floating)
 * block the later of its start and baseDate. A floating block's entered rate is the
 * rate it paid so far; after baseDate it floats at the reset rate (ADR 0162).
 */
export function rateFixedUntil(block: MortgageBlock, baseDate: Date): Date {
  if (block.fixationYears > 0) return blockEndDate(block);
  return isAfter(block.startDate, baseDate) ? block.startDate : baseDate;
}

/**
 * True when the block's fixation ended on or before `baseDate`: every payment from
 * baseDate on is at the assumed reset rate, so the owner should enter the refix terms
 * as a new block (D-30). A floating (0-year) block has no fixation to end (ADR 0162).
 * The engine reports it; the wording is UI (P7).
 */
export function fixationExpired(block: MortgageBlock, baseDate: Date): boolean {
  return block.fixationYears > 0 && isOnOrBefore(blockEndDate(block), baseDate);
}

/**
 * The interest rate in force for a block at `date`, fixation- and shock-aware.
 * Schedules pass the payment's due date EDATE(start, k), so the payment due on the
 * fixation end is still at the fixed rate (D-21):
 *   • on/before `rateFixedUntil` → the block's own entered rate;
 *   • after it → `postFixationResetRatePa`.
 * For a floating block `rateFixedUntil` is baseDate (or its later start), so the
 * payments due by baseDate are at its entered rate (ADR 0162).
 * A scenario `rateShock` elevates the post-fixation rate by `deltaPa` for the first
 * `durationYears` after that date (a temporary spike at refix), then it reverts to
 * `postFixationResetRatePa`. Only payments due after baseDate are shocked: a what-if
 * never reprices history or the opening balance (DR-117). With no `rateShock` this is exactly the legacy 2-state
 * rate, so the amortization targets are unchanged. The schedule re-amortizes the
 * instalment on every change this returns.
 */
export function rateAt(
  date: Date,
  block: MortgageBlock,
  assumptions: Assumptions,
): Decimal {
  const endDate = rateFixedUntil(block, assumptions.baseDate);
  if (isOnOrBefore(date, endDate)) return block.interestRatePa;
  const { postFixationResetRatePa, rateShock, baseDate } = assumptions;
  if (
    rateShock &&
    isAfter(date, baseDate) &&
    isOnOrBefore(date, edate(endDate, rateShock.durationYears * 12))
  ) {
    return postFixationResetRatePa.plus(rateShock.deltaPa);
  }
  return postFixationResetRatePa;
}
