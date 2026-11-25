// What the Data check reports on a loan block (SPEC §4.4): the closed-form health check
// and implied vs contract maturity (D-29). The wording is UI (P7).
import { FV, PMT, type Decimal } from "../lib/money";
import { edate, isAfter } from "./dates";
import { isDevLoan } from "./loanBlock";
import { dueDate, termMonths } from "./loanTerm";
import { FULLY_AMORTIZES_TOLERANCE } from "./constants";
import type { IsoDate, MortgageBlock } from "./types";

export interface AmortizationHealth {
  /** Instalment that exactly amortizes the principal over the term at the block rate. */
  suggestedInstalment: Decimal;
  /** False when the entered instalment will not retire the loan by its term. */
  fullyAmortizes: boolean;
  /** Residual balance at term end at the entered instalment (≈0 when healthy). */
  shortfall: Decimal;
}

/**
 * Closed-form check (independent of the schedule, which re-amortizes at refix and
 * masks a bad instalment): does the entered instalment retire the loan by its term?
 * Uses the block's *original* rate over the full term. A loan whose term is derived
 * from the instalment (no explicit `loanTermYears`) amortizes by construction.
 */
export function amortizationHealth(block: MortgageBlock): AmortizationHealth {
  const rateMonthly = block.interestRatePa.div(12);
  const term = termMonths(block);
  const suggestedInstalment = PMT(
    rateMonthly,
    term,
    block.initialPrincipal.negated(),
  );
  // Residual balance after `term` payments of the entered instalment.
  const shortfall = FV(
    rateMonthly,
    term,
    block.monthlyInstalment.negated(),
    block.initialPrincipal,
  ).negated();
  const firstInterest = block.initialPrincipal.times(rateMonthly);
  const fullyAmortizes =
    block.monthlyInstalment.greaterThan(firstInterest) &&
    shortfall.lessThanOrEqualTo(FULLY_AMORTIZES_TOLERANCE);
  return { suggestedInstalment, fullyAmortizes, shortfall };
}

/**
 * The maturity the loan's own terms imply (D-29): the due date of its last payment,
 * `termMonths` after the start (D-08). Null for a development loan, whose term is
 * explicit. Unchanged by a refix (constant maturity).
 */
export function impliedMaturity(block: MortgageBlock): IsoDate | null {
  return isDevLoan(block) ? null : dueDate(block, termMonths(block));
}

/**
 * The implied and contract maturities when they differ by more than one month (D-29),
 * else null. One month absorbs NPER rounding (P02 §5). The warning itself is UI (P7).
 */
export function maturityMismatch(
  block: MortgageBlock,
): { implied: IsoDate; contract: IsoDate } | null {
  const contract = block.contractMaturityDate;
  const implied = impliedMaturity(block);
  if (!contract || !implied) return null;
  const outside =
    isAfter(edate(implied, -1), contract) ||
    isAfter(contract, edate(implied, 1));
  return outside ? { implied, contract } : null;
}
