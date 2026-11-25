// Decimal-safe money helpers. The engine uses these exclusively; never do
// floating-point arithmetic on currency (CLAUDE.md §5). The annuity maths (payment,
// balance, term) is the engine's: src/engine/finance.ts.
import Decimal from "decimal.js";

// The one and only Decimal configuration (tested in decimal-config.test.ts). This
// module is the only importer of decimal.js, so the setting applies to every Decimal
// the app creates: 40 significant digits, ROUND_HALF_UP. We round only at display
// (CLAUDE.md §5); rounding mode is pinned explicitly although it is the library
// default, so a library upgrade cannot change it silently.

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
 * Round up to whole Kč. Used for a derived loan instalment: ceiling (as banks do)
 * guarantees the payment fully amortizes the principal — nearest-rounding can
 * underpay by < 1 Kč/mo, which compounds to a residual above the
 * `amortizationHealth` fully-amortizes threshold and would wrongly flag the loan.
 */
export function ceilCzk(value: Numeric): Decimal {
  return D(value).toDecimalPlaces(0, Decimal.ROUND_CEIL);
}

export { Decimal };
