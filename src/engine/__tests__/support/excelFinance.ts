// Spreadsheet annuity functions (Excel FV, PMT, NPER), kept as a test oracle (#477): the
// engine computes with `src/engine/finance.ts`, which has no sign convention; tests
// derive expected values from these independent Excel formulas.
//
// Conventions follow spreadsheet finance functions (Excel/CZ annuity model):
//   - `rate` is the *per-period* rate (e.g. annual / 12 for monthly).
//   - Cash-flow sign convention matches Excel: money you receive is positive,
//     money you pay out is negative. Present value of a loan to the borrower is
//     positive (cash in); instalments are negative (cash out).
// They follow Excel and do not validate: NPER with instalment ≤ interest ⇒ NaN, 0 % with
// 0 instalment ⇒ Infinity.
import { D, ONE, type Decimal, type Numeric } from "../../../lib/money";

/**
 * Future value of an annuity (Excel FV).
 *   FV = -[ pv*(1+r)^n + pmt*((1+r)^n - 1)/r * (1 + r*type) ]
 * `type` = 0 (end-of-period, default) or 1 (beginning-of-period).
 *
 * For a loan: pass pv = +principal (cash received) and pmt = -instalment
 * (cash paid). The returned FV is the remaining balance as a *negative* number
 * (what you still owe / would pay), so callers typically negate it.
 */
export function FV(
  rate: Numeric,
  nper: number,
  pmt: Numeric,
  pv: Numeric,
  type: 0 | 1 = 0,
): Decimal {
  const r = D(rate);
  const p = D(pmt);
  const present = D(pv);
  if (r.isZero()) {
    return present.plus(p.times(nper)).negated();
  }
  const growth = r.plus(ONE).pow(nper); // (1+r)^n
  const factor = growth
    .minus(ONE)
    .div(r)
    .times(ONE.plus(r.times(type)));
  return present.times(growth).plus(p.times(factor)).negated();
}

/**
 * Payment for an annuity (Excel PMT).
 *   PMT = -(pv*(1+r)^n + fv) * r / ((1+r)^n - 1) / (1 + r*type)
 * Returns the per-period payment with Excel's sign convention (negative when
 * pv is a positive loan balance).
 */
export function PMT(
  rate: Numeric,
  nper: number,
  pv: Numeric,
  fv: Numeric = 0,
  type: 0 | 1 = 0,
): Decimal {
  const r = D(rate);
  const present = D(pv);
  const future = D(fv);
  if (r.isZero()) {
    return present.plus(future).div(nper).negated();
  }
  const growth = r.plus(ONE).pow(nper);
  const numerator = present.times(growth).plus(future).times(r);
  const denominator = growth.minus(ONE).times(ONE.plus(r.times(type)));
  return numerator.div(denominator).negated();
}

/**
 * Number of periods for an annuity (Excel NPER).
 *   n = ln((pmt*(1+r*type) - fv*r) / (pmt*(1+r*type) + pv*r)) / ln(1+r)
 * Returns a (possibly fractional) Decimal; callers ceil() for whole months.
 *
 * Sign convention: for a loan use pv = +principal, pmt = -instalment.
 */
export function NPER(
  rate: Numeric,
  pmt: Numeric,
  pv: Numeric,
  fv: Numeric = 0,
  type: 0 | 1 = 0,
): Decimal {
  const r = D(rate);
  const p = D(pmt);
  const present = D(pv);
  const future = D(fv);
  if (r.isZero()) {
    return present.plus(future).div(p).negated();
  }
  const adj = p.times(ONE.plus(r.times(type)));
  const numerator = adj.minus(future.times(r));
  const denominator = adj.plus(present.times(r));
  // Decimal.js exposes ln() with the configured precision.
  return numerator.div(denominator).ln().div(r.plus(ONE).ln());
}
