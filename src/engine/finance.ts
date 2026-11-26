// Annuity maths of a loan (SPEC §4.4, CLAUDE.md §5), on decimal.js with no sign
// convention: a principal, a balance and an instalment are all positive amounts; `rate` is
// the per-period (monthly) rate. Each function runs the same Decimal operations, in the
// same order, as the spreadsheet formula it replaces (Excel PMT, FV and NPER with fv = 0,
// type = 0), so every result is the same to the last of the 40 digits.
//
// They do not validate: an instalment that never covers the interest gives NaN or
// Infinity, which the engine refuses upstream (ADR 0017, `assertLoanInputs` /
// `termMonths`).
import { ONE, type Decimal } from "../lib/money";

/**
 * The level payment that repays `principal` over `n` periods at `rate`:
 * principal·r·(1+r)^n / ((1+r)^n − 1), or principal / n at 0 % (Excel −PMT).
 */
export function annuityPayment(
  rate: Decimal,
  n: number,
  principal: Decimal,
): Decimal {
  if (rate.isZero()) return principal.div(n);
  const growth = rate.plus(ONE).pow(n);
  return principal.times(growth).times(rate).div(growth.minus(ONE));
}

/**
 * The balance left after `n` payments of `payment` on `principal` at `rate`:
 * principal·(1+r)^n − payment·((1+r)^n − 1)/r, or principal − payment·n at 0 %
 * (Excel −FV). Negative when the payments repay more than the principal.
 */
export function balanceAfter(
  rate: Decimal,
  n: number,
  payment: Decimal,
  principal: Decimal,
): Decimal {
  if (rate.isZero()) return principal.minus(payment.times(n));
  const growth = rate.plus(ONE).pow(n);
  return principal
    .times(growth)
    .minus(payment.times(growth.minus(ONE).div(rate)));
}

/**
 * How many payments of `payment` repay `balance` at `rate` (fractional; callers round
 * up): ln(payment / (payment − balance·r)) / ln(1+r), or balance / payment at 0 %
 * (Excel NPER). The ratio is formed as −payment / (balance·r − payment), as Excel does,
 * so a payment equal to the interest gives NaN, not Infinity.
 */
export function paymentsToRepay(
  rate: Decimal,
  payment: Decimal,
  balance: Decimal,
): Decimal {
  if (rate.isZero()) return balance.div(payment);
  const ratio = payment.negated().div(balance.times(rate).minus(payment));
  return ratio.ln().div(rate.plus(ONE).ln());
}
