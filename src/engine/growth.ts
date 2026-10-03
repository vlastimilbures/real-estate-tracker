// Single source of truth for the value-growth formula, shared by the current
// snapshot and the projection. Both grow the same anchored value (metrics.ts
// `valueAnchor`) by whole completed months / 12 (D-32), which is what makes the
// "snapshot at baseDate+N == projection year N" invariant hold by construction.
import { ONE, ZERO, powYears, type Decimal, type Numeric } from "../lib/money";
import { isAfter, isOnOrBefore } from "./dates";
import type { MortgageBlock, Property } from "./types";

/**
 * The date a property's value basis is anchored at: baseDate for a property owned by
 * then, its purchase date for a future buy (nothing is in force at baseDate yet).
 */
export function basisDate(property: Property, baseDate: Date): Date {
  return isAfter(property.purchaseDate, baseDate)
    ? property.purchaseDate
    : baseDate;
}

/** Appreciated value: v0 × (1+g)^years. `years` may be fractional (partial year). */
export function valueAt(v0: Decimal, g: Numeric, years: number): Decimal {
  if (years <= 0) return v0;
  return v0.times(powYears(ONE.plus(g), years));
}

/** Total scheduled principal of a loan: the initial principal plus every later draw. */
export function scheduledPrincipal(block: MortgageBlock): Decimal {
  return (block.draws ?? []).reduce<Decimal>(
    (s, d) => s.plus(d.amount),
    block.initialPrincipal,
  );
}

/**
 * Construction-progress fraction for a development loan: cumulative principal drawn by
 * `date` ÷ total scheduled principal (initialPrincipal + all tranche draws), clamped to
 * [0,1]. A development property's value is scaled by this so it ramps with the drawdown
 * — 0 before the first draw, `initialPrincipal/total` at loan start, reaching 1 at the
 * last draw (so a fully-drawn / completed property shows its full value automatically).
 * Lives next to `valueAt` so the snapshot and the projection multiply by the *same* pure
 * function and the baseDate+N == year-N invariant cannot drift.
 */
export function drawnFraction(block: MortgageBlock, date: Date): Decimal {
  const draws = block.draws ?? [];
  const total = scheduledPrincipal(block);
  if (total.isZero()) return ONE;
  let cumulative = isOnOrBefore(block.startDate, date)
    ? block.initialPrincipal
    : ZERO;
  for (const d of draws) {
    if (isOnOrBefore(d.date, date)) cumulative = cumulative.plus(d.amount);
  }
  const f = cumulative.div(total);
  return f.greaterThan(ONE) ? ONE : f.isNegative() ? ZERO : f;
}
