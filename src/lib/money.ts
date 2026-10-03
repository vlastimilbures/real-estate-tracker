// Decimal-safe money & finance helpers. The engine uses these exclusively;
// never do floating-point arithmetic on currency (CLAUDE.md §5).
//
// Conventions follow spreadsheet finance functions (Excel/CZ annuity model):
//   - `rate` is the *per-period* rate (e.g. annual / 12 for monthly).
//   - Cash-flow sign convention matches Excel: money you receive is positive,
//     money you pay out is negative. Present value of a loan to the borrower is
//     positive (cash in); instalments are negative (cash out).
import Decimal from "decimal.js";

// The one and only Decimal configuration (tested in decimal-config.test.ts). This
// module is the only importer of decimal.js, so the setting applies to every Decimal
// the app creates: 40 significant digits, ROUND_HALF_UP. We round only at display
// (CLAUDE.md §5); rounding mode is pinned explicitly although it is the library
// default, so a library upgrade cannot change it silently.
//
// Guard policy: these finance functions follow Excel and do not validate. Invalid
// inputs (NPER with instalment ≤ interest ⇒ NaN, 0 % with 0 instalment ⇒ Infinity,
// nper = 0) are rejected before they reach here — the engine raises an
// EngineInputError for them (D-17, `assertLoanInputs` / `termMonths`).
export const DECIMAL_PRECISION = 40;
export const DECIMAL_ROUNDING = Decimal.ROUND_HALF_UP;
Decimal.set({ precision: DECIMAL_PRECISION, rounding: DECIMAL_ROUNDING });

export type Numeric = Decimal.Value;

/** Construct a Decimal from a number/string/Decimal. */
export function D(value: Numeric): Decimal {
  return new Decimal(value);
}

export const ZERO = new Decimal(0);
export const ONE = new Decimal(1);

/**
 * Decimal-safe power with an integer exponent, e.g. (1+g)^t.
 * Uses Decimal.pow which is exact for integer exponents.
 */
export function powInt(base: Numeric, exponent: number): Decimal {
  if (!Number.isInteger(exponent)) {
    throw new Error(`powInt expects an integer exponent, got ${exponent}`);
  }
  return D(base).pow(exponent);
}

/**
 * Decimal-safe power with a fractional (year) exponent, e.g. (1+g)^(months/12)
 * for appreciating a value across a partial year. Collapses to (1+g)^t at whole
 * years. Decimal.pow handles non-integer exponents via internal ln/exp.
 */
export function powYears(base: Numeric, years: number): Decimal {
  return D(base).pow(years);
}

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

/** Round a Decimal to whole CZK (display helper). */
export function roundCzk(value: Numeric): Decimal {
  return D(value).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
}

/**
 * Round up to whole Kč. Used for a derived loan instalment: ceiling (as banks do)
 * guarantees the payment fully amortizes the principal — nearest-rounding can
 * underpay by < 1 Kč/mo, which compounds to a residual above the
 * `amortizationHealth` fully-amortizes threshold and would wrongly flag the loan.
 */
export function ceilCzk(value: Numeric): Decimal {
  return D(value).toDecimalPlaces(0, Decimal.ROUND_CEIL);
}

/** Convert a Decimal to a plain number at the display boundary only. */
export function toNumber(value: Numeric): number {
  return D(value).toNumber();
}

export { Decimal };
