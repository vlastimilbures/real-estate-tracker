// Real terms (D-23, DR-031): money in prices of the projection start (baseDate), deflated
// by the cumulative CPI index `cpiIndex` — the same index the real KPIs use, so a scenario's
// inflation shock reaches every real figure. With no shock the index is (1+inflation)^t.
// Also: the snapshot read off a projection year (DR-054, D-62), so an as-of date inside the
// horizon shows the projected year the charts plot.
import { ONE, ZERO, powYears, type Decimal } from "../lib/money";
import { at } from "./arrays";
import { lastGridMonthOnOrBefore } from "./dates";
import { buildCpiIndex, inflationInYear } from "./projections";
import { assertAssumptions } from "./validate";
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
 * it is 1; past the horizon it stays at the horizon index. Raises the
 * D-37 / D-38 problems of the assumptions first (ADR 0075, DR-115).
 */
export function cpiAt(assumptions: Assumptions, asOf: Date): Decimal {
  assertAssumptions(assumptions);
  // Months on the D-21 month-end grid, as value growth counts them (DR-182, ADR 0080).
  const months = lastGridMonthOnOrBefore(assumptions.baseDate, asOf);
  if (months <= 0) return ONE;
  const cpi = buildCpiIndex(assumptions);
  const whole = Math.floor(months / 12);
  if (whole >= assumptions.horizonYears)
    return at(cpi, assumptions.horizonYears);
  const rest = months - whole * 12;
  if (rest === 0) return at(cpi, whole);
  const infl = inflationInYear(assumptions, whole + 1);
  return at(cpi, whole).times(powYears(ONE.plus(infl), rest / 12));
}

/** Projection rows in real terms: each money field ÷ its year's index (`cpi[year]`).
 *  Ratios (LTV, DSCR) and the rate are lens-invariant. */
export function realProjection(
  rows: ProjectionYear[],
  cpi: Decimal[],
): ProjectionYear[] {
  return rows.map((y) => {
    const k = at(cpi, y.year);
    const d = (v: Decimal) => v.div(k);
    return {
      ...y,
      value: d(y.value),
      balance: d(y.balance),
      equity: d(y.equity),
      grossRent: d(y.grossRent),
      effectiveRent: d(y.effectiveRent),
      holdingCosts: d(y.holdingCosts),
      noi: d(y.noi),
      interest: d(y.interest),
      principal: d(y.principal),
      debtService: d(y.debtService),
      netCashFlow: d(y.netCashFlow),
      draws: d(y.draws),
      prepaid: d(y.prepaid),
      prepaymentFees: d(y.prepaymentFees),
    };
  });
}

/** Portfolio snapshot money fields ÷ `k`; ratios, `asOf` and the per-property list are
 *  kept. `k = 1` returns the snapshot itself. */
export function realPortfolioSnapshot(
  s: PortfolioSnapshot,
  k: Decimal,
): PortfolioSnapshot {
  if (k.equals(ONE)) return s;
  const d = (v: Decimal) => v.div(k);
  return {
    ...s,
    totalValue: d(s.totalValue),
    totalDebt: d(s.totalDebt),
    totalEquity: d(s.totalEquity),
    grossAnnualRent: d(s.grossAnnualRent),
    effectiveGrossIncome: d(s.effectiveGrossIncome),
    holdingCosts: d(s.holdingCosts),
    noi: d(s.noi),
    annualDebtService: d(s.annualDebtService),
    netCashFlow: d(s.netCashFlow),
  };
}

/** Per-property counterpart of `realPortfolioSnapshot`. */
export function realPropertySnapshot(
  s: PropertySnapshot,
  k: Decimal,
): PropertySnapshot {
  if (k.equals(ONE)) return s;
  const d = (v: Decimal) => v.div(k);
  return {
    ...s,
    value: d(s.value),
    debt: d(s.debt),
    equity: d(s.equity),
    grossAnnualRent: d(s.grossAnnualRent),
    effectiveGrossIncome: d(s.effectiveGrossIncome),
    holdingCosts: d(s.holdingCosts),
    noi: d(s.noi),
    annualDebtService: d(s.annualDebtService),
    netCashFlow: d(s.netCashFlow),
  };
}

const ratio = (n: Decimal, d: Decimal) => (d.isZero() ? ZERO : n.div(d));

/** The projection-year figures a snapshot reads (a `ProjectionYear` or a lensed copy). */
export type YearFigures = Pick<
  ProjectionYear,
  | "value"
  | "balance"
  | "equity"
  | "ltv"
  | "grossRent"
  | "effectiveRent"
  | "holdingCosts"
  | "noi"
  | "debtService"
  | "netCashFlow"
  | "dscr"
>;

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
    totalValue: r.value,
    totalDebt: r.balance,
    totalEquity: r.equity,
    ltv: r.ltv,
    grossAnnualRent: r.grossRent,
    effectiveGrossIncome: r.effectiveRent,
    holdingCosts: r.holdingCosts,
    noi: r.noi,
    annualDebtService: r.debtService,
    netCashFlow: r.netCashFlow,
    grossYield: ratio(r.grossRent, r.value),
    netYield: ratio(r.noi, r.value),
    dscr: r.dscr,
  };
}

/** Per-property counterpart of `portfolioSnapshotAtYear`. */
export function propertySnapshotAtYear(
  s: PropertySnapshot,
  r: YearFigures,
): PropertySnapshot {
  return {
    ...s,
    value: r.value,
    debt: r.balance,
    equity: r.equity,
    ltv: r.ltv,
    grossAnnualRent: r.grossRent,
    effectiveGrossIncome: r.effectiveRent,
    holdingCosts: r.holdingCosts,
    noi: r.noi,
    annualDebtService: r.debtService,
    netCashFlow: r.netCashFlow,
    grossYield: ratio(r.grossRent, r.value),
    netYield: ratio(r.noi, r.value),
    dscr: r.dscr,
  };
}
