// One classification of the fields of a projection year. The empty row, the opening row,
// the portfolio sum and the real-terms lens read their field lists from this table, so a
// field added to `ProjectionYear` and left out of it fails `tsc`, and a money field
// cannot stay nominal in a real series.
import { ZERO, type Decimal } from "../lib/money";
import type { ProjectionYear } from "./types";

/**
 * - `label`: the year and its period, never divided or summed;
 * - `ratio`: lens-invariant, recomputed (LTV, DSCR) or not summed (the rate);
 * - `stock`: a year-end amount, summed across properties;
 * - `derivedStock`: a stock computed from the summed ones (`stocksOf`), never summed;
 * - `flow`: an amount of the year, summed across properties;
 * - `ownerFlow`: cash to owner, set after the sum (`withCashToOwner`), never summed.
 */
export type YearFieldKind =
  "label" | "ratio" | "stock" | "derivedStock" | "flow" | "ownerFlow";

/** Every field of `ProjectionYear`, in its declaration order, with its kind. */
export const YEAR_FIELD_KINDS = {
  year: "label",
  calendarYear: "label",
  periodStart: "label",
  periodEnd: "label",
  value: "stock",
  balance: "stock",
  committedDebt: "stock",
  undrawnDebt: "stock",
  reportedValue: "derivedStock",
  equity: "derivedStock",
  ltv: "ratio",
  grossRent: "flow",
  effectiveRent: "flow",
  holdingCosts: "flow",
  noi: "flow",
  interest: "flow",
  principal: "flow",
  debtService: "flow",
  netCashFlow: "flow",
  draws: "flow",
  committedDraws: "flow",
  acquiredValue: "flow",
  refinanced: "flow",
  prepaid: "flow",
  prepaymentFees: "flow",
  cashToOwner: "ownerFlow",
  dscr: "ratio",
  ratePa: "ratio",
} as const satisfies Record<keyof ProjectionYear, YearFieldKind>;

type Kinds = typeof YEAR_FIELD_KINDS;

/** The fields of the given kinds. */
type KeysOfKind<K extends YearFieldKind> = {
  [F in keyof Kinds]: Kinds[F] extends K ? F : never;
}[keyof Kinds];

/** The fields of the given kinds, in the table's order. */
export function fieldsOf<K extends YearFieldKind>(
  ...kinds: K[]
): KeysOfKind<K>[] {
  const wanted = new Set<YearFieldKind>(kinds);
  return (Object.keys(YEAR_FIELD_KINDS) as (keyof Kinds)[]).filter(
    (f): f is KeysOfKind<K> => wanted.has(YEAR_FIELD_KINDS[f]),
  );
}

/** One `Decimal` per field, in the order of `fields`. */
export function decimalsOf<K extends string>(
  fields: readonly K[],
  valueOf: (field: K) => Decimal = () => ZERO,
): Record<K, Decimal> {
  return Object.fromEntries(fields.map((f) => [f, valueOf(f)])) as Record<
    K,
    Decimal
  >;
}
