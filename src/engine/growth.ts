// Single source of truth for the value-growth formula, shared by the current
// snapshot and the projection. Both grow the same anchored value (metrics.ts
// `valueAnchor`) by whole completed months / 12 (D-32), which is what makes the
// "snapshot at baseDate+N == projection year N" invariant hold by construction.
import { ONE, powYears, type Decimal, type Numeric } from "../lib/money";
import { isAfter, isOnOrBefore } from "./dates";
import type { Assumptions, MortgageBlock, Property } from "./types";

/**
 * The date a property's value basis is anchored at: baseDate for a property owned by
 * then, its purchase date for a future buy (nothing is in force at baseDate yet).
 */
export function basisDate(property: Property, baseDate: Date): Date {
  return isAfter(property.purchaseDate, baseDate)
    ? property.purchaseDate
    : baseDate;
}

/** The property's appreciation rate: its own override, else the assumption level. */
export function growthRate(
  property: Property,
  assumptions: Assumptions,
): Decimal {
  return property.appreciationOverridePa ?? assumptions.appreciationPa;
}

/**
 * The rate a purchase price with no valuation grows at before the basis: the property's
 * own override, else the base level, never a scenario's (ADR 0181).
 */
export function openingGrowthRate(
  property: Property,
  assumptions: Assumptions,
): Decimal {
  return (
    property.appreciationOverridePa ??
    assumptions.openingAppreciationPa ??
    assumptions.appreciationPa
  );
}

/** Appreciated value: v0 × (1+g)^years. `years` may be fractional (partial year). */
export function valueAt(v0: Decimal, g: Numeric, years: number): Decimal {
  if (years <= 0) return v0;
  return v0.times(powYears(ONE.plus(g), years));
}

/** What a principal sum reads of a loan: the start draw and the tranches, so a draft
 *  loan being edited can be summed too (#481). */
type Principal = Pick<MortgageBlock, "initialPrincipal" | "draws">;

/** A loan's initial principal plus its tranches dated on or before `cutoff` (all of them
 *  without one), summed in their order from the initial principal. */
export function principalDrawnBy(block: Principal, cutoff?: Date): Decimal {
  return (block.draws ?? [])
    .filter((d) => !cutoff || isOnOrBefore(d.date, cutoff))
    .reduce<Decimal>((s, d) => s.plus(d.amount), block.initialPrincipal);
}

/** Total scheduled principal of a loan: the initial principal plus every later draw. */
export function scheduledPrincipal(block: Principal): Decimal {
  return principalDrawnBy(block);
}
