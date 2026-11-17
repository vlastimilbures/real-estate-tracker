// The payment calendar of the loan schedule and its tranche bucketing (D-21).
import { ZERO, type Decimal } from "../../lib/money";
import { firstGridMonthOnOrAfter, isAfter, isOnOrBefore } from "../dates";
import { drawMonth, dueDate, paymentsDueBy, rateAt } from "../amortization";
import type {
  Assumptions,
  IsoDate,
  MortgageBlock,
  MortgageDraw,
} from "../types";

/**
 * Payment number carried by grid month 0 (D-21): the payments due by baseDate for a
 * running loan, or −drawMonth for a future loan (drawn in grid month drawMonth, first
 * payment the month after). Grid month m then carries payment `offset + m`.
 */
export function paymentOffset(block: MortgageBlock, baseDate: Date): number {
  return isAfter(block.startDate, baseDate)
    ? -drawMonth(block, baseDate)
    : paymentsDueBy(block, baseDate);
}

/** Due date of the last payment due by baseDate (the start when none is due yet). */
export function lastPaymentDue(block: MortgageBlock, baseDate: Date): Date {
  return dueDate(block, paymentsDueBy(block, baseDate));
}

/** The rate of payment `p`, read on its due date EDATE(start, p) (D-21). */
export function rateOfPayment(
  p: number,
  block: MortgageBlock,
  assumptions: Assumptions,
): Decimal {
  return rateAt(dueDate(block, p), block, assumptions);
}

/** True while a development loan is interest-only (up to and including completion). */
export function interestOnlyAt(block: MortgageBlock, date: Date): boolean {
  return (
    block.completionDate != null && isOnOrBefore(date, block.completionDate)
  );
}

// ---------------------------------------------------------------------------
// Tranche bucketing
// ---------------------------------------------------------------------------

/** Group dated items by the step `stepOf` gives their date, in input order, over the
 *  items the `include` predicate accepts. */
export function bucketByStep<T extends { date: IsoDate }>(
  items: readonly T[],
  include: (d: Date) => boolean,
  stepOf: (d: Date) => number,
): Map<number, T[]> {
  const buckets = new Map<number, T[]>();
  for (const item of items) {
    if (!include(item.date)) continue;
    const k = stepOf(item.date);
    buckets.set(k, [...(buckets.get(k) ?? []), item]);
  }
  return buckets;
}

/** Bucket draw amounts by the first cadence step (anchor + k months) on or after their
 *  date, summing collisions, over the draws the `include` predicate accepts. A valid
 *  draw is dated on or before payment term−2, so it lands before the final payment,
 *  month-end clamps included (ADR 0226 §1). */
export function bucketDraws(
  draws: MortgageDraw[],
  anchor: Date,
  include: (d: Date) => boolean,
): Map<number, Decimal> {
  const sums = new Map<number, Decimal>();
  const stepOf = (d: Date) => firstGridMonthOnOrAfter(anchor, d);
  for (const [k, items] of bucketByStep(draws, include, stepOf)) {
    sums.set(
      k,
      items.reduce((sum, d) => sum.plus(d.amount), ZERO),
    );
  }
  return sums;
}

/** A development loan's tranches after the last payment due by baseDate and on/before
 *  baseDate: grid month 1 draws them, the baseDate debt counts them (D-41, D-44). */
export function lateTranches(
  block: MortgageBlock,
  baseDate: Date,
): MortgageDraw[] {
  const lastDue = lastPaymentDue(block, baseDate);
  return (block.draws ?? []).filter(
    (d) => isAfter(d.date, lastDue) && isOnOrBefore(d.date, baseDate),
  );
}

export function sumDraws(draws: readonly MortgageDraw[]): Decimal {
  return draws.reduce((sum, d) => sum.plus(d.amount), ZERO);
}
