// The instalment of a loan block (SPEC §4.4): the annuity, the whole-CZK figure a form
// suggests and the instalment a schedule opens with (D-31).
import { PMT, ceilCzk, type Decimal } from "../lib/money";
import { isDevLoan } from "./loanBlock";
import type { MortgageBlock } from "./types";

/** Annuity instalment that amortizes `principal` over `termYears` at `ratePa`. */
export function instalmentFor(
  principal: Decimal,
  ratePa: Decimal,
  termYears: number,
): Decimal {
  return PMT(ratePa.div(12), termYears * 12, principal.negated());
}

/**
 * Whole-CZK instalment to suggest for a new loan: the annuity rounded UP, so paying it
 * always retires the loan within the term (a nearest-rounded figure can fall short).
 */
export function suggestedInstalment(
  principal: Decimal,
  ratePa: Decimal,
  termYears: number,
): Decimal {
  return ceilCzk(instalmentFor(principal, ratePa, termYears));
}

/**
 * Instalment a schedule opens with: the entered one for a plain loan, or, for a
 * development loan, the annuity of its principal over the required term at the block
 * rate (D-31) — the entered field is not used for development loans.
 */
export function scheduledInstalment(block: MortgageBlock): Decimal {
  return isDevLoan(block)
    ? instalmentFor(
        block.initialPrincipal,
        block.interestRatePa,
        block.loanTermYears,
      )
    : block.monthlyInstalment;
}
