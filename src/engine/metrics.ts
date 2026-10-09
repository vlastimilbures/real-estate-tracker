// Current snapshot — per property and portfolio (SPEC §4.3).
import { ZERO, ONE, type Decimal } from "../lib/money";
import {
  isOnOrBefore,
  isAfter,
  lastGridMonthOnOrBefore,
  lastOnOrBefore,
  inForceOrUpcoming,
} from "./dates";
import { isDevLoan } from "./amortization";
import {
  balanceAtMonth,
  instalmentAtMonth,
  openingDebt,
  propertySchedule,
  schedulesByProperty,
} from "./schedule";
import { assertAsOf, assertInputs } from "./validate";
import { basisDate, valueAt, drawnFraction } from "./growth";
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

/** Valuation in force at `asOf`: latest validFrom ≤ asOf, validTo blank or ≥ asOf. */
export function valuationInForce(
  valuations: Valuation[],
  asOf: Date,
): Valuation | undefined {
  return lastOnOrBefore(
    valuations,
    asOf,
    (v) => v.validFrom,
    (v) => v.validTo,
  );
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
  const g = property.appreciationOverridePa ?? assumptions.appreciationPa;
  const { value, anchor } = valueAnchor(
    valuations,
    property,
    assumptions,
    asOf,
  );
  return valueAt(value, g, growthYears(anchor, asOf));
}

/**
 * Snapshot value. For a development property the valuation is the *completed* value,
 * scaled by the drawn fraction so it ramps with construction progress (0 before the
 * first draw → full at the last draw). Non-dev properties skip the multiply.
 */
function snapshotValue(
  property: Property,
  portfolio: Portfolio,
  assumptions: Assumptions,
  asOf: Date,
  blocks: MortgageBlock[],
): Decimal {
  const rawValue = valueAsOf(
    forProperty(portfolio.valuations, property.id),
    property,
    assumptions,
    asOf,
  );
  const devBlock = blocks.find(isDevLoan);
  return devBlock ? rawValue.times(drawnFraction(devBlock, asOf)) : rawValue;
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
  // DR-071: the first holding-cost row wins when a property has duplicates.
  const cost = forProperty(portfolio.holdingCosts, property.id).at(0);
  const c = effectiveCosts(cost, assumptions);
  const variable = c.mgmtPctRent.plus(c.maintPctRent).times(grossAnnualRent);
  const holdingCosts = fixedHoldingCost(c).plus(variable);
  const noi = effectiveGrossIncome.minus(holdingCosts);
  return { grossAnnualRent, effectiveGrossIncome, holdingCosts, noi };
}

/**
 * One property's snapshot at `asOf`. Pass its `schedule` (from `schedulesByProperty` on
 * the same inputs) to reuse it; an omitted one is built here (DR-042, DR-118).
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
  return snapshotProperty(property, portfolio, assumptions, asOf, rows);
}

/**
 * `propertySnapshot` on inputs and an as-of date the caller has already validated
 * (DR-128).
 */
function snapshotProperty(
  property: Property,
  portfolio: Portfolio,
  assumptions: Assumptions,
  asOf: IsoDate,
  schedule: AmortizationRow[],
): PropertySnapshot {
  const blocks = forProperty(portfolio.mortgages, property.id);
  const value = snapshotValue(property, portfolio, assumptions, asOf, blocks);
  const { debt, monthlyInstalment, rate } = snapshotDebt(
    blocks,
    assumptions,
    asOf,
    schedule,
  );
  const income = snapshotIncome(property, portfolio, assumptions, asOf);
  const annualDebtService = monthlyInstalment.times(12);

  return {
    propertyId: property.id,
    name: property.name,
    owned: isOnOrBefore(property.purchaseDate, asOf),
    active: property.active !== false,
    value,
    debt,
    equity: value.minus(debt),
    ltv: ltvOf(debt, value),
    ...income,
    annualDebtService,
    netCashFlow: income.noi.minus(annualDebtService),
    grossYield: yieldOf(income.grossAnnualRent, value),
    netYield: yieldOf(income.noi, value),
    dscr: annualDebtService.isZero() ? null : income.noi.div(annualDebtService),
    weightedRateNumerator: debt.times(rate),
  };
}

/**
 * Portfolio snapshot at `asOf`. Pass `schedules` (from `schedulesByProperty` on the same
 * inputs) to reuse them; omitted ones are built here (DR-042, DR-118).
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
  const perProperty = portfolio.properties.map((p) =>
    snapshotProperty(p, portfolio, assumptions, asOf, built.get(p.id) ?? []),
  );
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
  const grossAnnualRent = sum((s) => s.grossAnnualRent);
  const effectiveGrossIncome = sum((s) => s.effectiveGrossIncome);
  const holdingCosts = sum((s) => s.holdingCosts);
  const noi = sum((s) => s.noi);
  const annualDebtService = sum((s) => s.annualDebtService);
  const weightedNumerator = sumOf(owing)((s) => s.weightedRateNumerator);

  return {
    asOf,
    perProperty,
    totalValue,
    totalDebt,
    totalEquity: totalValue.minus(totalDebt),
    ltv: ltvOf(totalDebt, totalValue),
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
