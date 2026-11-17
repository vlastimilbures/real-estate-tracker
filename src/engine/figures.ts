// The formulas the current snapshot (./metrics) and the projection (./projections)
// share, written once so snapshot(baseDate + N y) and projection year N cannot drift
// apart (#478). Each keeps the order of decimal operations both used before. Gross rent
// stays with each caller: the snapshot reads the lease in force × 12, the projection
// the rent plan of the year. This module imports no other engine module but types.
import { ONE, ZERO, type Decimal } from "../lib/money";
import type { CostDefaults, HoldingCost } from "./types";

type CostKeys = readonly (keyof CostDefaults & keyof HoldingCost)[];

/** The Kč fields of the holding costs (a holding-cost row, the assumption defaults). */
export const COST_MONEY_KEYS = [
  "propertyTaxYr",
  "insuranceYr",
  "svjMonthly",
  "otherYr",
] as const satisfies CostKeys;

/** The shares of rent of the holding costs: management and maintenance (ADR 0182). */
export const COST_RATE_KEYS = [
  "mgmtPctRent",
  "maintPctRent",
] as const satisfies CostKeys;

/** Every holding-cost field, money then rates. `effectiveCosts` returns a full
 *  `CostDefaults` record from it, so a cost field left out fails `tsc` (#478). */
export const COST_KEYS = [...COST_MONEY_KEYS, ...COST_RATE_KEYS] as const;

/** LTV = debt ÷ value; null when debt is owed on no value, 0 when neither (ADR 0133). */
export function ltvOf(debt: Decimal, value: Decimal): Decimal | null {
  if (!value.isZero()) return debt.div(value);
  return debt.isZero() ? ZERO : null;
}

/** A yield = income ÷ value; null when there is no value (ADR 0133). */
export function yieldOf(income: Decimal, value: Decimal): Decimal | null {
  return value.isZero() ? null : income.div(value);
}

/** DSCR = NOI ÷ debt service; null when there is no debt service. */
export function dscrOf(noi: Decimal, debtService: Decimal): Decimal | null {
  return debtService.isZero() ? null : noi.div(debtService);
}

/**
 * A position's stocks. Committed debt = the drawn balance + the development tranches not
 * drawn yet (ADR 0166); equity and LTV use it. The screens show the drawn balance beside
 * the value less those tranches (`reportedValue`, ADR 0169). A portfolio passes its own
 * Σ committed debt: Σbalance + Σundrawn could round differently in the last digits and
 * move the golden hashes (ADR 0039).
 */
export function stocksOf(
  value: Decimal,
  balance: Decimal,
  undrawnDebt: Decimal,
  committedDebt = balance.plus(undrawnDebt),
) {
  return {
    value,
    balance,
    committedDebt,
    undrawnDebt,
    reportedValue: value.minus(undrawnDebt),
    equity: value.minus(committedDebt),
    ltv: ltvOf(committedDebt, value),
  };
}

/**
 * Rent collected, holding costs and NOI from the gross rent: the fixed cost, management
 * on the rent collected and maintenance on the rent contracted (ADR 0182).
 */
export function costsAndNoi(
  fixed: Decimal,
  grossRent: Decimal,
  vacancy: Decimal,
  mgmtPct: Decimal,
  maintPct: Decimal,
): { effectiveRent: Decimal; holdingCosts: Decimal; noi: Decimal } {
  const effectiveRent = grossRent.times(ONE.minus(vacancy));
  const holdingCosts = fixed
    .plus(mgmtPct.times(effectiveRent))
    .plus(maintPct.times(grossRent));
  const noi = effectiveRent.minus(holdingCosts);
  return { effectiveRent, holdingCosts, noi };
}
