// Current snapshot — per property and portfolio (SPEC §4.3).
import { ZERO, type Decimal } from "../lib/money";
import {
  isOnOrBefore,
  isAfter,
  lastGridMonthOnOrBefore,
  lastOnOrBefore,
  inForceOrUpcoming,
} from "./dates";
import {
  balanceAtMonth,
  instalmentAtMonth,
  openingDebt,
  propertySchedule,
  propertySchedules,
  scheduleRows,
  undrawnPrincipal,
} from "./schedule";
import { assertAsOf, assertInputs, type ValidInputs } from "./validate";
import { basisDate, growthRate, openingGrowthRate, valueAt } from "./growth";
import {
  COST_KEYS,
  costsAndNoi,
  dscrOf,
  ltvOf,
  stocksOf,
  yieldOf,
} from "./figures";
import { decimalsOf } from "./yearFields";
import type {
  Assumptions,
  CostDefaults,
  Portfolio,
  Property,
  Valuation,
  Lease,
  HoldingCost,
  MortgageBlock,
  AmortizationRow,
  IsoDate,
  PropertySnapshot,
  PortfolioSnapshot,
} from "./types";
import { monthsToYears } from "./units";

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

// LTV and yields live with the other shared formulas (./figures, #478).
export { yieldOf };
/** @internal re-exported for the tests that read it here (ltv-zero-value.test.ts) */
export { ltvOf };

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

/**
 * Market value at `asOf`: the anchored value (see `valueAnchor`) grown by appreciation
 * from its anchor forward. With only the base valuation (≤ basis) this is the parity value
 * at baseDate (exponent 0).
 */
function valueAsOf(
  valuations: Valuation[],
  property: Property,
  assumptions: Assumptions,
  asOf: Date,
): Decimal {
  const g = growthRate(property, assumptions);
  const { value, anchor } = valueAnchor(
    valuations,
    property,
    assumptions,
    asOf,
  );
  return valueAt(value, g, growthYears(anchor, asOf));
}

/**
 * Debt, instalment and rate at `asOf`, read from the fixation-aware schedule (so a
 * future asOf past a reset reflects the re-amortized instalment). `schedule` must be
 * the property's rows built from the same inputs: it has no rows only when the
 * property has no loan, which gives zeros.
 */
function snapshotDebt(
  blocks: MortgageBlock[],
  assumptions: Assumptions,
  asOf: Date,
  schedule: AmortizationRow[],
): { debt: Decimal; monthlyInstalment: Decimal; rate: Decimal } {
  // The last grid row dated on/before asOf (D-21: a clamped month-end grid date
  // counts, DR-070).
  const month = lastGridMonthOnOrBefore(assumptions.baseDate, asOf);
  // Grid month 0 is baseDate itself: a loan drawn after it is not debt yet (D-33).
  const debt =
    month === 0
      ? openingDebt(blocks, assumptions)
      : balanceAtMonth(schedule, month);
  const st = instalmentAtMonth(schedule, month);
  // Instalment/rate apply only while there is debt outstanding at asOf.
  return debt.isZero()
    ? { debt, monthlyInstalment: ZERO, rate: ZERO }
    : { debt, monthlyInstalment: st.instalment, rate: st.ratePa };
}

/** Rent in force at `asOf` (no upcoming fallback — DR-045) and holding costs. */
function snapshotIncome(
  property: Property,
  portfolio: Portfolio,
  assumptions: Assumptions,
  asOf: Date,
) {
  const lease = leaseInForce(forProperty(portfolio.leases, property.id), asOf);
  const monthlyRent = lease ? lease.monthlyRent : ZERO;
  const grossAnnualRent = monthlyRent.times(12);
  const costs = holdingCostBasis(property, portfolio, assumptions);
  const { effectiveRent, holdingCosts, noi } = costsAndNoi(
    costs.fixed,
    grossAnnualRent,
    assumptions.vacancyAllowance,
    costs,
  );
  return {
    grossAnnualRent,
    effectiveGrossIncome: effectiveRent,
    holdingCosts,
    noi,
  };
}

/**
 * One property's snapshot at `asOf`. Pass its `schedule` (the rows from `propertySchedules`
 * on the same inputs) to reuse it; an omitted one is built here (DR-042, DR-118).
 */
// eslint-disable-next-line max-params -- public API with app and test callers (#480)
export function propertySnapshot(
  property: Property,
  portfolio: Portfolio,
  assumptions: Assumptions,
  asOf: IsoDate = assumptions.baseDate,
  schedule?: AmortizationRow[],
): PropertySnapshot {
  const v = assertInputs(portfolio, assumptions); // D-37
  assertAsOf(asOf, assumptions.baseDate); // D-19: no snapshot before the projection start
  const rows =
    schedule ??
    propertySchedule(forProperty(portfolio.mortgages, property.id), assumptions)
      .rows;
  return snapshotProperty(property, v, asOf, rows).snapshot;
}

/** A property snapshot and the rate in force at its `asOf` (0 without debt). */
interface RatedSnapshot {
  snapshot: PropertySnapshot;
  rate: Decimal;
}

/**
 * Σ debt × rate over the active rows (the `owing` rows of `portfolioSnapshot`; keep the
 * two filters alike), in portfolio order from 0 (ADR 0177).
 */
function weightedRateNumerator(rated: RatedSnapshot[]): Decimal {
  return rated
    .filter((r) => r.snapshot.active)
    .reduce((acc, r) => acc.plus(r.snapshot.debt.times(r.rate)), ZERO);
}

/**
 * `propertySnapshot` on validated inputs and an as-of date the caller has already
 * checked (DR-128), with the rate `portfolioSnapshot` weights by the debt (ADR 0177).
 */
function snapshotProperty(
  property: Property,
  v: ValidInputs,
  asOf: IsoDate,
  schedule: AmortizationRow[],
): RatedSnapshot {
  const { portfolio, assumptions } = v;
  const blocks = forProperty(portfolio.mortgages, property.id);
  // A development property is valued at its completed value (ADR 0166).
  const value = valueAsOf(
    forProperty(portfolio.valuations, property.id),
    property,
    assumptions,
    asOf,
  );
  const { debt, monthlyInstalment, rate } = snapshotDebt(
    blocks,
    assumptions,
    asOf,
    schedule,
  );
  const income = snapshotIncome(property, portfolio, assumptions, asOf);
  const annualDebtService = monthlyInstalment.times(12);
  const owned = isOnOrBefore(property.purchaseDate, asOf);
  // ADR 0166: an owned property also owes the development tranches not drawn yet,
  // on the schedule grid the debt is read from.
  const undrawnDebt = owned
    ? undrawnPrincipal(
        property,
        blocks,
        assumptions,
        lastGridMonthOnOrBefore(assumptions.baseDate, asOf),
      )
    : ZERO;
  const st = stocksOf(value, debt, undrawnDebt);

  const snapshot: PropertySnapshot = {
    propertyId: property.id,
    name: property.name,
    owned,
    active: property.active !== false,
    value,
    debt,
    committedDebt: st.committedDebt,
    undrawnDebt,
    reportedValue: st.reportedValue,
    equity: st.equity,
    ltv: st.ltv,
    ...income,
    annualDebtService,
    netCashFlow: income.noi.minus(annualDebtService),
    grossYield: yieldOf(income.grossAnnualRent, value),
    netYield: yieldOf(income.noi, value),
    dscr: dscrOf(income.noi, annualDebtService),
  };
  return { snapshot, rate };
}

/** The portfolio snapshot's names for the totals' stocks (`stocksOf`). */
function portfolioStocks(st: ReturnType<typeof stocksOf>) {
  return {
    totalValue: st.value,
    totalDebt: st.balance,
    totalCommittedDebt: st.committedDebt,
    totalUndrawnDebt: st.undrawnDebt,
    totalReportedValue: st.reportedValue,
    totalEquity: st.equity,
    ltv: st.ltv,
  };
}

/**
 * Portfolio snapshot at `asOf`. Pass `schedules` (the rows from `propertySchedules` on the
 * same inputs) to reuse them; omitted ones are built here (DR-042, DR-118).
 * @internal test seam: tests pin it; the app runs `portfolioOutputs`.
 */
export function portfolioSnapshot(
  portfolio: Portfolio,
  assumptions: Assumptions,
  asOf: IsoDate = assumptions.baseDate,
  schedules?: Map<string, AmortizationRow[]>,
): PortfolioSnapshot {
  const v = assertInputs(portfolio, assumptions); // D-37
  // D-19, checked once so an empty portfolio raises too (ADR 0075, DR-131).
  assertAsOf(asOf, assumptions.baseDate);
  const built =
    schedules ??
    scheduleRows(
      propertySchedules(
        portfolio.mortgages,
        portfolio.properties.map((p) => p.id),
        assumptions,
      ),
    );
  return snapshotPortfolio(v, asOf, built);
}

/**
 * `portfolioSnapshot` on validated inputs, an as-of date the caller has already checked
 * (`assertAsOf`) and the rows of every property's schedule (DR-128).
 */
export function snapshotPortfolio(
  v: ValidInputs,
  asOf: IsoDate,
  schedules: Map<string, AmortizationRow[]>,
): PortfolioSnapshot {
  const rated = v.portfolio.properties.map((p) =>
    snapshotProperty(p, v, asOf, schedules.get(p.id) ?? []),
  );
  const perProperty = rated.map((r) => r.snapshot);
  // Not-yet-owned and deactivated properties are listed but excluded from current totals,
  // except that a pending property's loan already drawn at asOf is owed now: its debt
  // counts, its value does not (ADR 0165). A loan starting at the purchase adds 0.
  const owned = perProperty.filter((s) => s.owned && s.active);
  const owing = perProperty.filter((s) => s.active);
  const sumOf =
    (rows: PropertySnapshot[]) =>
    (sel: (s: PropertySnapshot) => Decimal): Decimal =>
      rows.reduce((acc, s) => acc.plus(sel(s)), ZERO);
  const sum = sumOf(owned);

  const totalValue = sum((s) => s.value);
  const totalDebt = sumOf(owing)((s) => s.debt);
  const totalCommittedDebt = sumOf(owing)((s) => s.committedDebt);
  // Summed over the owing rows like committed debt; a not-owned row's undrawn is 0, so
  // totalReportedValue − totalDebt = totalEquity (ADR 0169).
  const totalUndrawnDebt = sumOf(owing)((s) => s.undrawnDebt);
  const grossAnnualRent = sum((s) => s.grossAnnualRent);
  const effectiveGrossIncome = sum((s) => s.effectiveGrossIncome);
  const holdingCosts = sum((s) => s.holdingCosts);
  const noi = sum((s) => s.noi);
  const annualDebtService = sum((s) => s.annualDebtService);
  const weightedNumerator = weightedRateNumerator(rated);

  return {
    asOf,
    perProperty,
    ...portfolioStocks(
      stocksOf(totalValue, totalDebt, totalUndrawnDebt, totalCommittedDebt),
    ),
    grossAnnualRent,
    effectiveGrossIncome,
    holdingCosts,
    noi,
    annualDebtService,
    netCashFlow: noi.minus(annualDebtService),
    grossYield: yieldOf(grossAnnualRent, totalValue),
    netYield: yieldOf(noi, totalValue),
    dscr: dscrOf(noi, annualDebtService),
    weightedAvgRate: totalDebt.isZero()
      ? ZERO
      : weightedNumerator.div(totalDebt),
  };
}
