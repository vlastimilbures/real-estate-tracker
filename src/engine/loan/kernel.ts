// The month-step kernel of the loan schedule (SPEC §4.4; see `pay.ts`).
import { PMT, ZERO, type Decimal } from "../../lib/money";
import { isAfter } from "../dates";
import type { AmortizationRow, IsoDate, MortgageBlock } from "../types";

// ---------------------------------------------------------------------------
// The month-step kernel
// ---------------------------------------------------------------------------

/**
 * Split one annuity payment into interest and principal at a given balance & monthly
 * rate. Interest accrues only on a positive balance; principal is the remainder,
 * clamped to [0, balance] so it never goes negative (instalment under interest) nor
 * overshoots the outstanding balance (final payment).
 */
function splitPayment(
  instalment: Decimal,
  balance: Decimal,
  rateMonthly: Decimal,
): { interest: Decimal; principal: Decimal } {
  const interest = balance.isPositive() ? balance.times(rateMonthly) : ZERO;
  let principal = instalment.minus(interest);
  if (principal.isNegative()) principal = ZERO;
  if (principal.greaterThan(balance)) principal = balance;
  return { interest, principal };
}

/**
 * Instalment that amortizes `balance` over `remainingTerm` months at `rateMonthly`,
 * or a one-shot payoff (balance + this month's interest) when the term has run out.
 */
export function recomputeInstalment(
  rateMonthly: Decimal,
  remainingTerm: number,
  balance: Decimal,
): Decimal {
  return remainingTerm > 0
    ? PMT(rateMonthly, remainingTerm, balance.negated())
    : balance.plus(balance.times(rateMonthly));
}

/** What one month of the amortization core pays and leaves outstanding. */
export interface MonthStep {
  instalment: Decimal;
  interest: Decimal;
  principal: Decimal;
  endBalance: Decimal;
}

/** How one payment is paid; `agreed`: it pays an agreed instalment (ADR 0109 §6). */
export interface PaymentTerms {
  instalment: Decimal;
  agreed: boolean;
  reamortizeOver: number | null;
  atMaturity: boolean;
}

/**
 * One month of the amortization core on `balanceIn` (any tranche already added):
 * interest-only months pay interest and no principal; otherwise the instalment in
 * force (`pay.instalment`) — re-amortized over `pay.reamortizeOver` months when that
 * is not null; an agreed instalment at least the interest — is split into interest
 * and principal. The payment at maturity
 * (`pay.atMaturity`: payment number ≥ term) pays the whole balance, so no residual
 * outlives the loan (D-40).
 */
export function amortizeMonth(
  balanceIn: Decimal,
  ratePa: Decimal,
  interestOnly: boolean,
  pay: PaymentTerms,
): MonthStep {
  const rateMonthly = ratePa.div(12);
  if (interestOnly) {
    const interest = balanceIn.isPositive()
      ? balanceIn.times(rateMonthly)
      : ZERO;
    return {
      instalment: interest,
      interest,
      principal: ZERO,
      endBalance: balanceIn,
    };
  }
  const scheduled =
    pay.reamortizeOver === null
      ? pay.instalment
      : recomputeInstalment(rateMonthly, pay.reamortizeOver, balanceIn);
  // An agreed instalment pays at least the month's interest (ADR 0137): a tranche on
  // its payment can lift the interest above it, and the shortfall would be lost.
  const owed = balanceIn.times(rateMonthly);
  const paid = pay.agreed && owed.greaterThan(scheduled) ? owed : scheduled;
  const split = splitPayment(paid, balanceIn, rateMonthly);
  const interest = split.interest;
  const principal = pay.atMaturity ? balanceIn : split.principal;
  return {
    instalment: paid,
    interest,
    principal,
    endBalance: balanceIn.minus(principal),
  };
}

/** Re-amortization trigger: a tranche landing, the end of interest-only, or a rate
 *  change (D-24). Between events the instalment holds. A plain loan has no tranches
 *  and no interest-only months, so for it this is a rate change only. (`greaterThan`,
 *  because `Decimal(0).isPositive()` is true — DR-102.) */
export function reamortizes(
  draw: Decimal,
  prevInterestOnly: boolean,
  interestOnly: boolean,
  ratePa: Decimal,
  prevRate: Decimal,
): boolean {
  return (
    draw.greaterThan(ZERO) ||
    (prevInterestOnly && !interestOnly) ||
    !ratePa.equals(prevRate)
  );
}

/** A no-payment row (undrawn future loan, or a fully repaid loan past payoff): no
 *  payment is due, so no due date (ADR 0164). */
export function zeroRow(
  month: number,
  date: IsoDate,
  ratePa: Decimal,
  endBalance: Decimal = ZERO,
): AmortizationRow {
  return {
    month,
    date,
    dueDate: null,
    ratePa,
    instalment: ZERO,
    interest: ZERO,
    principal: ZERO,
    drawn: ZERO,
    refinanced: ZERO,
    prepaid: ZERO,
    prepaymentFee: ZERO,
    endBalance,
  };
}

/**
 * Row for a future loan before it is drawn: a zero row until the grid date reaches
 * startDate, then the draw row (balance = initialPrincipal drawn, no payment yet — the
 * baseDate-month-0 analog). `drawsNow` tells the caller the loan is now drawn.
 */
export function undrawnRow(
  block: MortgageBlock,
  m: number,
  date: IsoDate,
): { row: AmortizationRow; drawsNow: boolean } {
  if (isAfter(block.startDate, date)) {
    return { row: zeroRow(m, date, block.interestRatePa), drawsNow: false };
  }
  return {
    row: {
      ...zeroRow(m, date, block.interestRatePa, block.initialPrincipal),
      drawn: block.initialPrincipal,
    },
    drawsNow: true,
  };
}
