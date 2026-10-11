// Current snapshot — per property and portfolio (SPEC §4.3).
import { ZERO, ONE, type Decimal } from "../lib/money";
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
  schedulesByProperty,
  undrawnPrincipal,
} from "./schedule";
import { assertAsOf, assertInputs } from "./validate";
import { basisDate, growthRate, valueAt } from "./growth";
import type {
  Assumptions,
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
) {
  const d = assumptions.defaults;
  const pick = (a: Decimal | undefined, fallback: Decimal) => a ?? fallback;
  return {
    propertyTaxYr: pick(cost?.propertyTaxYr, d.propertyTaxYr),
    insuranceYr: pick(cost?.insuranceYr, d.insuranceYr),
    mgmtPctRent: pick(cost?.mgmtPctRent, d.mgmtPctRent),
    maintPctRent: pick(cost?.maintPctRent, d.maintPctRent),
    svjMonthly: pick(cost?.svjMonthly, d.svjMonthly),
    otherYr: pick(cost?.otherYr, d.otherYr),
  };
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
 * Opening value at `asOf`: the governing valuation's market value (`selectValuation`),
 * else the purchase price. The projection basis (a future buy's down payment starts
 * from its price instead, ADR 0119).
 */
export function openingValue(
  valuations: Valuation[],
  property: Property,
  asOf: Date,
): Decimal {
  const val = selectValuation(valuations, asOf);
  return val ? val.marketValue : property.purchasePrice;
}

/** LTV = debt ÷ value; null when debt is owed on no value, 0 when neither (ADR 0133). */
export function ltvOf(debt: Decimal, value: Decimal): Decimal | null {
  if (!value.isZero()) return debt.div(value);
  return debt.isZero() ? ZERO : null;
}

/** A yield = income ÷ value; null when there is no value (ADR 0133). */
export function yieldOf(income: Decimal, value: Decimal): Decimal | null {
  return value.isZero() ? null : income.div(value);
}

/**
 * The value that growth starts from at `asOf`, and the date it starts. The valuation
 * governing `asOf` (`selectValuation`: the latest started, else the nearest
 * upcoming), else the purchase price. Growth starts at the later of its validFrom
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
  if (!gov) return { value: property.purchasePrice, anchor: basis };
  return {
    value: gov.marketValue,
    anchor: isAfter(gov.validFrom, basis) ? gov.validFrom : basis,
  };
}

/** Years of growth from `anchor` to `asOf`: grid months / 12 by the D-21 month-end
 *  rule, so a clamped month-end (29 Feb → 28 Feb) counts (D-32, D-45); never negative. */
export function growthYears(anchor: Date, asOf: Date): number {
  return lastGridMonthOnOrBefore(anchor, asOf) / 12;
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
  const effectiveGrossIncome = grossAnnualRent.times(
    ONE.minus(assumptions.vacancyAllowance),
  );
  const { fixed, mgmtPct, maintPct } = holdingCostBasis(
    property,
    portfolio,
    assumptions,
  );
  // Management on the rent collected, maintenance on the rent contracted (ADR 0182).
  const holdingCosts = fixed
    .plus(mgmtPct.times(effectiveGrossIncome))
    .plus(maintPct.times(grossAnnualRent));
  const noi = effectiveGrossIncome.minus(holdingCosts);
  return { grossAnnualRent, effectiveGrossIncome, holdingCosts, noi };
}

/**
 * One property's snapshot at `asOf`. Pass its `schedule` (the rows from `propertySchedules`
 * on the same inputs) to reuse it; an omitted one is built here (DR-042, DR-118).
 */
export function propertySnapshot(
  property: Property,
  portfolio: Portfolio,
  assumptions: Assumptions,
  asOf: IsoDate = assumptions.baseDate,
  schedule?: AmortizationRow[],
): PropertySnapshot {
  assertInputs(portfolio, assumptions); // D-37
  assertAsOf(asOf, assumptions.baseDate); // D-19: no snapshot before the projection start
  const rows =
    schedule ??
    propertySchedule(forProperty(portfolio.mortgages, property.id), assumptions)
      .rows;
  return snapshotProperty(property, portfolio, assumptions, asOf, rows)
    .snapshot;
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
 * `propertySnapshot` on inputs and an as-of date the caller has already validated
 * (DR-128), with the rate `portfolioSnapshot` weights by the debt (ADR 0177).
 */
function snapshotProperty(
  property: Property,
  portfolio: Portfolio,
  assumptions: Assumptions,
  asOf: IsoDate,
  schedule: AmortizationRow[],
): RatedSnapshot {
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
  const committedDebt = debt.plus(undrawnDebt);

  const snapshot: PropertySnapshot = {
    propertyId: property.id,
    name: property.name,
    owned,
    active: property.active !== false,
    value,
    debt,
    committedDebt,
    undrawnDebt,
    reportedValue: value.minus(undrawnDebt),
    equity: value.minus(committedDebt),
    ltv: ltvOf(committedDebt, value),
    ...income,
    annualDebtService,
    netCashFlow: income.noi.minus(annualDebtService),
    grossYield: yieldOf(income.grossAnnualRent, value),
    netYield: yieldOf(income.noi, value),
    dscr: annualDebtService.isZero() ? null : income.noi.div(annualDebtService),
  };
  return { snapshot, rate };
}

/**
 * Portfolio snapshot at `asOf`. Pass `schedules` (the rows from `propertySchedules` on the
 * same inputs) to reuse them; omitted ones are built here (DR-042, DR-118).
 */
export function portfolioSnapshot(
  portfolio: Portfolio,
  assumptions: Assumptions,
  asOf: IsoDate = assumptions.baseDate,
  schedules?: Map<string, AmortizationRow[]>,
): PortfolioSnapshot {
  assertInputs(portfolio, assumptions); // D-37
  // D-19, checked once so an empty portfolio raises too (ADR 0075, DR-131).
  assertAsOf(asOf, assumptions.baseDate);
  const built =
    schedules ??
    schedulesByProperty(
      portfolio.mortgages,
      portfolio.properties.map((p) => p.id),
      assumptions,
    );
  const rated = portfolio.properties.map((p) =>
    snapshotProperty(p, portfolio, assumptions, asOf, built.get(p.id) ?? []),
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
    totalValue,
    totalDebt,
    totalCommittedDebt,
    totalUndrawnDebt,
    totalReportedValue: totalValue.minus(totalUndrawnDebt),
    totalEquity: totalValue.minus(totalCommittedDebt),
    ltv: ltvOf(totalCommittedDebt, totalValue),
    grossAnnualRent,
    effectiveGrossIncome,
    holdingCosts,
    noi,
    annualDebtService,
    netCashFlow: noi.minus(annualDebtService),
    grossYield: yieldOf(grossAnnualRent, totalValue),
    netYield: yieldOf(noi, totalValue),
    dscr: annualDebtService.isZero() ? null : noi.div(annualDebtService),
    weightedAvgRate: totalDebt.isZero()
      ? ZERO
      : weightedNumerator.div(totalDebt),
  };
}
