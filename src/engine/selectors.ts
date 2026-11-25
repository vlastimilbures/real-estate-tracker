// The shared lookups of the engine's inputs (#480): a property's rows, the lease and
// valuation in force at a date, the value growth starts from, the holding-cost basis,
// and which properties count. The snapshot, projection, acquisition and upcoming-events
// modules read them here instead of from the snapshot module.
import type { Decimal } from "../lib/money";
import {
  inForceOrUpcoming,
  isAfter,
  lastGridMonthOnOrBefore,
  lastOnOrBefore,
} from "./dates";
import { COST_KEYS } from "./figures";
import { basisDate, openingGrowthRate, valueAt } from "./growth";
import { decimalsOf } from "./yearFields";
import type {
  Assumptions,
  CostDefaults,
  HoldingCost,
  Lease,
  Portfolio,
  Property,
  Valuation,
} from "./types";
import { monthsToYears } from "./units";

/** Whether a property counts in portfolio totals, projections and KPIs: `active` unless
 *  deactivated. The mapper always writes a boolean; an absent flag means active. */
export function isActive(property: Property): boolean {
  return property.active ?? true;
}

/** The properties that count (`isActive`), in portfolio order. */
export function activeProperties(properties: Property[]): Property[] {
  return properties.filter((p) => isActive(p));
}

/** Lease in force at `asOf`: latest startDate ≤ asOf, endDate blank or ≥ asOf. */
export function leaseInForce(leases: Lease[], asOf: Date): Lease | undefined {
  return lastOnOrBefore(
    leases,
    asOf,
    (l) => l.startDate,
    (l) => l.endDate,
  );
}

/** Valuation governing `asOf`: the latest one started on or before it, else the
 *  nearest upcoming (a recorded value beats the stale purchase price). Its validTo is
 *  not read: a value does not expire, the next valuation replaces it (ADR 0122).
 *  Undefined only when there is no valuation. Single source for this fallback. */
export function selectValuation(
  valuations: Valuation[],
  asOf: Date,
): Valuation | undefined {
  return inForceOrUpcoming(valuations, asOf, (v) => v.validFrom);
}

/** Resolve effective holding-cost fields, falling back to assumption defaults. */
export function effectiveCosts(
  cost: HoldingCost | undefined,
  assumptions: Assumptions,
): Record<keyof CostDefaults, Decimal> {
  const d = assumptions.defaults;
  return decimalsOf(COST_KEYS, (k) => cost?.[k] ?? d[k]);
}

/** Fixed (inflation-able) annual holding cost: tax + insurance + svj*12 + other. */
export function fixedHoldingCost(c: {
  propertyTaxYr: Decimal;
  insuranceYr: Decimal;
  svjMonthly: Decimal;
  otherYr: Decimal;
}): Decimal {
  return c.propertyTaxYr
    .plus(c.insuranceYr)
    .plus(c.svjMonthly.times(12))
    .plus(c.otherYr);
}

/**
 * A property's holding-cost basis: the fixed annual cost and the management and
 * maintenance shares of rent, each field from its holding-cost row, else the assumption
 * default. One holding-cost row per property (DUPLICATE_HOLDING_COST, D-37).
 */
export function holdingCostBasis(
  property: Property,
  portfolio: Portfolio,
  assumptions: Assumptions,
): { fixed: Decimal; mgmtPct: Decimal; maintPct: Decimal } {
  const cost = forProperty(portfolio.holdingCosts, property.id).at(0);
  const c = effectiveCosts(cost, assumptions);
  return {
    fixed: fixedHoldingCost(c),
    mgmtPct: c.mgmtPctRent,
    maintPct: c.maintPctRent,
  };
}

export function forProperty<T extends { propertyId: string }>(
  rows: T[],
  propertyId: string,
): T[] {
  return rows.filter((r) => r.propertyId === propertyId);
}

/**
 * The value that growth starts from at `asOf`, and the date it starts. The valuation
 * governing `asOf` (`selectValuation`: the latest started, else the nearest
 * upcoming), as entered; with no valuation at all, the purchase price grown by whole
 * months from the purchase date to the basis at `openingGrowthRate` (ADR 0181; 0 months
 * for a future buy). Growth starts at the later of its validFrom
 * and the basis (baseDate, or purchaseDate for a future buy), so a valuation dated
 * after the basis re-anchors growth from its own validFrom. Shared by the snapshot and
 * the projection, so snapshot(baseDate + N y) == projection year N (D-32).
 */
export function valueAnchor(
  valuations: Valuation[],
  property: Property,
  assumptions: Assumptions,
  asOf: Date,
): { value: Decimal; anchor: Date } {
  const basis = basisDate(property, assumptions.baseDate);
  const gov = selectValuation(valuations, asOf);
  if (!gov)
    return {
      value: valueAt(
        property.purchasePrice,
        openingGrowthRate(property, assumptions),
        growthYears(property.purchaseDate, basis),
      ),
      anchor: basis,
    };
  return {
    value: gov.marketValue,
    anchor: isAfter(gov.validFrom, basis) ? gov.validFrom : basis,
  };
}

/** Years of growth from `anchor` to `asOf`: grid months / 12 by the D-21 month-end
 *  rule, so a clamped month-end (29 Feb → 28 Feb) counts (D-32, D-45); never negative. */
export function growthYears(anchor: Date, asOf: Date): number {
  return monthsToYears(lastGridMonthOnOrBefore(anchor, asOf));
}
