// Real terms (D-23, DR-031): money in prices of the projection start (baseDate), deflated
// by the cumulative CPI index `cpiIndex` — the same index the real KPIs use, so a scenario's
// inflation shock reaches every real figure. With no shock the index is (1+inflation)^t.
// Also: the snapshot read off a projection year (DR-054, D-62), so an as-of date inside the
// horizon shows the projected year the charts plot.
import { ONE, powYears, type Decimal } from "../lib/money";
import { at } from "./arrays";
import { lastGridMonthOnOrBefore } from "./dates";
import { yieldOf } from "./metrics";
import { buildCpiIndex, inflationInYear } from "./projections";
import { assertAssumptions } from "./validate";
import { decimalsOf, fieldsOf } from "./yearFields";
import type {
  Assumptions,
  PortfolioSnapshot,
  ProjectionYear,
  PropertySnapshot,
} from "./types";

/**
 * Price index at `asOf` (baseDate = 1): the yearly index of the last whole projection
 * year, compounded at the next year's rate for the remaining months (months/12), with
 * months on the grid so baseDate + N years gives year N's index. On or before baseDate
 * it is 1. Raises the D-37 / D-38 problems of the assumptions first (ADR 0075, DR-115),
 * and a RangeError for a date after baseDate + horizonYears: the as-of resolver keeps
 * every date inside the window, so a later one is a caller bug (ADR 0150).
 */
export function cpiAt(assumptions: Assumptions, asOf: Date): Decimal {
  assertAssumptions(assumptions);
  // Months on the D-21 month-end grid, as value growth counts them (DR-182, ADR 0080).
  const months = lastGridMonthOnOrBefore(assumptions.baseDate, asOf);
  if (months <= 0) return ONE;
  if (months > assumptions.horizonYears * 12)
    throw new RangeError(
      `cpiAt: as-of ${asOf.toISOString().slice(0, 10)} is past the horizon.`,
    );
  const cpi = buildCpiIndex(assumptions);
  const whole = Math.floor(months / 12);
  const rest = months - whole * 12;
  if (rest === 0) return at(cpi, whole);
  const infl = inflationInYear(assumptions, whole + 1);
  return at(cpi, whole).times(powYears(ONE.plus(infl), rest / 12));
}

/** Every money field of a projection year: all but the labels and the ratios (#478). */
const YEAR_MONEY_FIELDS = fieldsOf(
  "stock",
  "derivedStock",
  "flow",
  "ownerFlow",
);

/** Projection rows in real terms: each money field ÷ its year's index (`cpi[year]`),
 *  derived stocks too (divided, not recomputed). Ratios (LTV, DSCR) and the rate are
 *  lens-invariant. */
export function realProjection(
  rows: ProjectionYear[],
  cpi: Decimal[],
): ProjectionYear[] {
  return rows.map((y) => {
    const k = at(cpi, y.year);
    return { ...y, ...decimalsOf(YEAR_MONEY_FIELDS, (f) => y[f].div(k)) };
  });
}

/** A snapshot field: an identifier or a list (`label`), an amount (`money`, divided in
 *  real terms) or a lens-invariant ratio (`ratio`). */
type SnapshotFieldKind = "label" | "money" | "ratio";

/** Every field of `PropertySnapshot` with its kind (#478).
 *  @internal exported for the compile-time fixture */
export const PROPERTY_SNAPSHOT_KINDS = {
  propertyId: "label",
  name: "label",
  owned: "label",
  active: "label",
  value: "money",
  debt: "money",
  committedDebt: "money",
  undrawnDebt: "money",
  reportedValue: "money",
  equity: "money",
  ltv: "ratio",
  grossAnnualRent: "money",
  effectiveGrossIncome: "money",
  holdingCosts: "money",
  noi: "money",
  annualDebtService: "money",
  netCashFlow: "money",
  grossYield: "ratio",
  netYield: "ratio",
  dscr: "ratio",
} as const satisfies Record<keyof PropertySnapshot, SnapshotFieldKind>;

/** Every field of `PortfolioSnapshot` with its kind (#478). The per-property list is
 *  kept as it is.
 *  @internal exported for the compile-time fixture */
export const PORTFOLIO_SNAPSHOT_KINDS = {
  asOf: "label",
  perProperty: "label",
  totalValue: "money",
  totalDebt: "money",
  totalCommittedDebt: "money",
  totalUndrawnDebt: "money",
  totalReportedValue: "money",
  totalEquity: "money",
  ltv: "ratio",
  grossAnnualRent: "money",
  effectiveGrossIncome: "money",
  holdingCosts: "money",
  noi: "money",
  annualDebtService: "money",
  netCashFlow: "money",
  grossYield: "ratio",
  netYield: "ratio",
  dscr: "ratio",
  weightedAvgRate: "ratio",
} as const satisfies Record<keyof PortfolioSnapshot, SnapshotFieldKind>;

/** The money fields of a snapshot table, in its order. */
function moneyOf<T extends Record<string, SnapshotFieldKind>>(table: T) {
  type Money = { [F in keyof T]: T[F] extends "money" ? F : never }[keyof T];
  return (Object.keys(table) as (keyof T & string)[]).filter(
    (f): f is Money & string => table[f] === "money",
  );
}

const PROPERTY_MONEY = moneyOf(PROPERTY_SNAPSHOT_KINDS);
const PORTFOLIO_MONEY = moneyOf(PORTFOLIO_SNAPSHOT_KINDS);

/** Portfolio snapshot money fields ÷ `k`; ratios, `asOf` and the per-property list are
 *  kept. `k = 1` returns the snapshot itself. */
export function realPortfolioSnapshot(
  s: PortfolioSnapshot,
  k: Decimal,
): PortfolioSnapshot {
  if (k.equals(ONE)) return s;
  return { ...s, ...decimalsOf(PORTFOLIO_MONEY, (f) => s[f].div(k)) };
}

/** Per-property counterpart of `realPortfolioSnapshot`. */
export function realPropertySnapshot(
  s: PropertySnapshot,
  k: Decimal,
): PropertySnapshot {
  if (k.equals(ONE)) return s;
  return { ...s, ...decimalsOf(PROPERTY_MONEY, (f) => s[f].div(k)) };
}

/** The fields a snapshot keeps from itself or computes (the yields), not read off a
 *  projection year. */
type NotFromYear = "grossYield" | "netYield";

/** Snapshot field → the projection-year field it is read from: every money and ratio
 *  field but the yields (#478). */
const PROPERTY_FROM_YEAR = {
  value: "value",
  debt: "balance",
  committedDebt: "committedDebt",
  undrawnDebt: "undrawnDebt",
  reportedValue: "reportedValue",
  equity: "equity",
  ltv: "ltv",
  grossAnnualRent: "grossRent",
  effectiveGrossIncome: "effectiveRent",
  holdingCosts: "holdingCosts",
  noi: "noi",
  annualDebtService: "debtService",
  netCashFlow: "netCashFlow",
  dscr: "dscr",
} as const satisfies Record<
  Exclude<
    keyof typeof PROPERTY_SNAPSHOT_KINDS,
    KeysOf<typeof PROPERTY_SNAPSHOT_KINDS, "label"> | NotFromYear
  >,
  keyof ProjectionYear
>;

/** Portfolio counterpart of `PROPERTY_FROM_YEAR`; the weighted rate stays from the
 *  snapshot (the projection has no weighted-rate breakdown). */
const PORTFOLIO_FROM_YEAR = {
  totalValue: "value",
  totalDebt: "balance",
  totalCommittedDebt: "committedDebt",
  totalUndrawnDebt: "undrawnDebt",
  totalReportedValue: "reportedValue",
  totalEquity: "equity",
  ltv: "ltv",
  grossAnnualRent: "grossRent",
  effectiveGrossIncome: "effectiveRent",
  holdingCosts: "holdingCosts",
  noi: "noi",
  annualDebtService: "debtService",
  netCashFlow: "netCashFlow",
  dscr: "dscr",
} as const satisfies Record<
  Exclude<
    keyof typeof PORTFOLIO_SNAPSHOT_KINDS,
    | KeysOf<typeof PORTFOLIO_SNAPSHOT_KINDS, "label">
    | NotFromYear
    | "weightedAvgRate"
  >,
  keyof ProjectionYear
>;

type KeysOf<T, K> = { [F in keyof T]: T[F] extends K ? F : never }[keyof T];

/** The projection-year figures a snapshot reads (a `ProjectionYear` or a lensed copy). */
export type YearFigures = Pick<
  ProjectionYear,
  | (typeof PROPERTY_FROM_YEAR)[keyof typeof PROPERTY_FROM_YEAR]
  | (typeof PORTFOLIO_FROM_YEAR)[keyof typeof PORTFOLIO_FROM_YEAR]
>;

/** Each snapshot field of `map` set to its year field of `r`, by reference. */
function readYear<M extends Record<string, keyof YearFigures>>(
  map: M,
  r: YearFigures,
): { [S in keyof M]: YearFigures[M[S]] } {
  return Object.fromEntries(
    Object.entries(map).map(([field, from]) => [field, r[from]]),
  ) as { [S in keyof M]: YearFigures[M[S]] };
}

/**
 * The portfolio snapshot read off projection year `r`: stocks at the year end, the
 * year's flows and their ratios. `asOf`, `perProperty` and `weightedAvgRate` stay from
 * `s` (the projection carries no per-property or weighted-rate breakdown).
 */
export function portfolioSnapshotAtYear(
  s: PortfolioSnapshot,
  r: YearFigures,
): PortfolioSnapshot {
  return {
    ...s,
    ...readYear(PORTFOLIO_FROM_YEAR, r),
    grossYield: yieldOf(r.grossRent, r.value),
    netYield: yieldOf(r.noi, r.value),
  };
}

/** Per-property counterpart of `portfolioSnapshotAtYear`. */
export function propertySnapshotAtYear(
  s: PropertySnapshot,
  r: YearFigures,
): PropertySnapshot {
  return {
    ...s,
    ...readYear(PROPERTY_FROM_YEAR, r),
    grossYield: yieldOf(r.grossRent, r.value),
    netYield: yieldOf(r.noi, r.value),
  };
}
