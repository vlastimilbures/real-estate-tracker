// A loan block's term and payment calendar (SPEC §4.4): its length in payments (D-08,
// D-17), payment numbers and due dates on its own cadence (D-21, ADR 0109) and how many
// grid months its schedule runs.
import { ZERO, type Decimal } from "../lib/money";
import { paymentsToRepay } from "./finance";
import {
  edate,
  firstGridMonthOnOrAfter,
  lastGridMonthOnOrBefore,
  isAfter,
} from "./dates";
import { isDevLoan } from "./loanBlock";
import type { Assumptions, IsoDate, MortgageBlock } from "./types";
import type { ValidationCode } from "./validate";
import { EngineInputError } from "./errors";
import { MAX_LOAN_TERM_MONTHS } from "./constants";
import { monthlyRate, yearsToMonths } from "./units";

/**
 * Why a loan's term cannot come from its instalment (NPER), or undefined when it can
 * (or when an explicit `loanTermYears` makes NPER irrelevant): a development loan
 * needs an explicit term; at 0 % the instalment must be positive; otherwise it must
 * exceed the first month's interest (DR-014). Expects finite principal and rate.
 */
export function derivedTermProblem(block: MortgageBlock):
  | {
      code: ValidationCode;
      field: "loanTermYears" | "monthlyInstalment";
    }
  | undefined {
  if (block.loanTermYears != null) return undefined;
  if (isDevLoan(block)) {
    return { code: "MISSING_TERM_FOR_DEV_LOAN", field: "loanTermYears" };
  }
  const field = "monthlyInstalment";
  if (block.interestRatePa.isZero()) {
    return block.monthlyInstalment.greaterThan(ZERO)
      ? undefined
      : { code: "ZERO_RATE_ZERO_INSTALMENT", field };
  }
  const firstInterest = block.initialPrincipal.times(
    monthlyRate(block.interestRatePa),
  );
  return block.monthlyInstalment.lessThanOrEqualTo(firstInterest)
    ? { code: "INSTALMENT_BELOW_INTEREST", field }
    : undefined;
}

/**
 * Total amortization term in months. When the block carries an explicit
 * `loanTermYears` that is authoritative (loanTermYears*12); otherwise the term is
 * derived from the instalment via NPER (legacy behaviour — preserves the parity
 * targets). Drives the constant-maturity remaining term at refix and the schedule
 * length for a future-drawn loan.
 */
export function termMonths(block: MortgageBlock): number {
  if (block.loanTermYears != null) return yearsToMonths(block.loanTermYears);
  // A dev loan without a term, a 0 % loan with no instalment, or an instalment that
  // never covers the interest has no NPER term (NaN or Infinity): raise a typed error
  // rather than emit an empty or endless schedule (D-17).
  const problem = derivedTermProblem(block);
  if (problem) {
    throw new EngineInputError([
      { ...problem, entity: "mortgage", id: block.id },
    ]);
  }
  return nperMonths(
    monthlyRate(block.interestRatePa),
    block.monthlyInstalment,
    block.initialPrincipal,
  );
}

/** Payment number of the first payment due on or after `date`: the payment a
 *  prepayment or recast dated `date` follows (ADR 0109). */
export function paymentOnOrAfter(block: MortgageBlock, date: Date): number {
  return firstGridMonthOnOrAfter(block.startDate, date);
}

/** Payment number of the last payment due on or before `date` (DR-070): a recast
 *  maturity as the loan's last payment (ADR 0109). */
export function paymentsDueBy(block: MortgageBlock, date: Date): number {
  return lastGridMonthOnOrBefore(block.startDate, date);
}

/** Due date of payment `p`, EDATE(start, p) on the loan's own cadence (D-21); payment 0
 *  is the start. */
export function dueDate(block: MortgageBlock, p: number): IsoDate {
  return edate(block.startDate, p);
}

/** The latest last payment a recast may set: loan start + 50 years, or the contract
 *  term when that is longer (ADR 0109). */
export function maxTermMonths(contractTerm: number): number {
  return Math.max(MAX_LOAN_TERM_MONTHS, contractTerm);
}

/** The latest payment the loan can reach with its recasts (ADR 0109): the contract
 *  term, a later recast maturity, or the cap when a recast sets an instalment. */
export function eventTermMonths(
  block: MortgageBlock,
  contractTerm: number,
): number {
  let term = contractTerm;
  for (const r of block.recasts ?? []) {
    const reach =
      r.maturity === undefined
        ? maxTermMonths(contractTerm)
        : paymentsDueBy(block, r.maturity);
    term = Math.max(term, reach);
  }
  return term;
}

/** Whole monthly payments of `instalment` that repay `balance` at `rateMonthly`
 *  (NPER rounded up; the last payment may be smaller). NaN or Infinity when the
 *  instalment never repays the balance. */
export function nperMonths(
  rateMonthly: Decimal,
  instalment: Decimal,
  balance: Decimal,
): number {
  const n = paymentsToRepay(rateMonthly, instalment, balance);
  // eslint-disable-next-line no-restricted-syntax -- an NPER month count, not money
  return Math.ceil(n.toNumber());
}

/**
 * The baseDate-anchored grid month a future loan draws in: the first month whose
 * grid date is on/after `startDate` (matching where `buildSchedule` opens the
 * balance). 0 for a loan already running at baseDate.
 */
export function drawMonth(block: MortgageBlock, baseDate: Date): number {
  if (!isAfter(block.startDate, baseDate)) return 0;
  return firstGridMonthOnOrAfter(baseDate, block.startDate);
}

/**
 * Number of monthly rows to generate: at least the horizon, but long enough that
 * the loan amortizes over its full term. The draw month carries no payment, so a
 * future loan needs `drawMonth + term` rows; a loan already running needs
 * `term − paymentsDueByBaseDate` rows from baseDate.
 */
export function scheduleMonths(
  block: MortgageBlock,
  assumptions: Assumptions,
): number {
  const { baseDate, horizonYears } = assumptions;
  const term = termMonths(block);
  const d = drawMonth(block, baseDate);
  const payoffMonth =
    d > 0 ? d + term : Math.max(0, term - paymentsDueBy(block, baseDate));
  return Math.max(yearsToMonths(horizonYears), payoffMonth);
}
