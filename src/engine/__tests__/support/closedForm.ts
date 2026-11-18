// TEST-ONLY: the closed-form balance the engine opened a plain loan with until
// ADR 0235, moved here unchanged. The frozen golden v1 edge-loan balances, the as-of
// snapshot tests and the reference edge cases pin it.
import { FV, ZERO, type Decimal } from "../../../lib/money";
import { paymentsDueBy } from "../../amortization";
import type { MortgageBlock } from "../../types";

/**
 * Outstanding balance of a block as of `asOf` after every payment due by then
 * (D-21), using the *original* rate & instalment, so it holds only before any refix.
 * Floored at 0.
 */
export function currentBalance(block: MortgageBlock, asOf: Date): Decimal {
  const n = paymentsDueBy(block, asOf);
  if (n <= 0) return block.initialPrincipal;
  const bal = FV(
    block.interestRatePa.div(12),
    n,
    block.monthlyInstalment.negated(),
    block.initialPrincipal,
  ).negated();
  return bal.isNegative() ? ZERO : bal;
}
