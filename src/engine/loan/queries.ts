// Reads of a built schedule: balance, instalment and last payment by grid month.
import { ZERO, type Decimal } from "../../lib/money";
import { at } from "../arrays";
import type { AmortizationRow } from "../types";

/**
 * Outstanding balance at a baseDate-anchored schedule month (0 = opening balance).
 * Clamped to the schedule's range: a month past the end pins to the final (typically
 * zero) balance. Fixation-aware because the schedule models the post-fixation reset.
 */
export function balanceAtMonth(
  schedule: AmortizationRow[],
  month: number,
): Decimal {
  if (schedule.length === 0) return ZERO;
  const m = Math.max(0, Math.min(month, schedule.length));
  if (m <= 0) {
    // Opening balance = first row's start balance = endBalance + principal +
    // prepaid (ADR 0109).
    const first = at(schedule, 0);
    return first.endBalance.plus(first.principal).plus(first.prepaid);
  }
  return at(schedule, m - 1).endBalance;
}

/**
 * Instalment & rate in force at a baseDate-anchored schedule month — reads the
 * row at that month so a future as-of date past the fixation reset reflects the
 * re-amortized instalment and reset rate. Month ≤ 0 (baseDate) uses the first row.
 * An amortizing month with a prepayment reports the next row's instalment when that
 * row draws nothing at the same rate: the balance at that month has already had the
 * prepayment taken off (ADR 0116).
 */
export function instalmentAtMonth(
  schedule: AmortizationRow[],
  month: number,
): { instalment: Decimal; ratePa: Decimal } {
  if (schedule.length === 0) return { instalment: ZERO, ratePa: ZERO };
  const idx = Math.max(0, Math.min(month, schedule.length) - 1);
  const row = at(schedule, Math.max(0, idx));
  const next = schedule[idx + 1];
  const after =
    month >= 1 &&
    row.prepaid.greaterThan(ZERO) &&
    row.principal.greaterThan(ZERO) &&
    next !== undefined &&
    next.drawn.isZero() &&
    next.refinanced.isZero() &&
    next.ratePa.equals(row.ratePa);
  return {
    instalment: after ? next.instalment : row.instalment,
    ratePa: row.ratePa,
  };
}

/** True when the row pays something. A prepayment counts: it can be the only cash of a
 *  month (ADR 0109). */
export const hasPayment = (r: AmortizationRow): boolean =>
  r.interest.plus(r.principal).plus(r.prepaid).greaterThan(ZERO);

/** Grid month of the schedule's last payment, 0 if it has none. */
export function lastPaymentMonth(rows: AmortizationRow[]): number {
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    if (r && hasPayment(r)) return i + 1;
  }
  return 0;
}
