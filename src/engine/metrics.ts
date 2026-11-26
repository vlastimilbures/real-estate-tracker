// Current snapshot — per property and portfolio (SPEC §4.3). The lookups it shares with
// the projection live in ./selectors.
import { ZERO, type Decimal } from "../lib/money";
import { isOnOrBefore, lastGridMonthOnOrBefore } from "./dates";
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
import { growthRate, valueAt } from "./growth";
import { costsAndNoi, dscrOf, ltvOf, stocksOf, yieldOf } from "./figures";
import {
  forProperty,
  growthYears,
  holdingCostBasis,
  isActive,
  leaseInForce,
  valueAnchor,
} from "./selectors";
import type {
  Assumptions,
  Portfolio,
  Property,
  Valuation,
  MortgageBlock,
  AmortizationRow,
  IsoDate,
  PropertySnapshot,
  PortfolioSnapshot,
} from "./types";

// LTV and yields live with the other shared formulas (./figures).
export { yieldOf };
/** @internal re-exported for the tests that read it here (ltv-zero-value.test.ts) */
export { ltvOf };

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
  // The last grid row dated on/before asOf (ADR 0021: a clamped month-end grid date
  // counts).
  const month = lastGridMonthOnOrBefore(assumptions.baseDate, asOf);
  // Grid month 0 is baseDate itself: a loan drawn after it is not debt yet (ADR 0033).
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

/** Rent in force at `asOf` (no upcoming fallback) and holding costs. */
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
 * One property's snapshot at `asOf`. Pass its `schedule` (the rows from
 * `propertySchedules` on the same inputs) to reuse it; an omitted one is built here.
 */
// eslint-disable-next-line max-params -- public API with app and test callers
export function propertySnapshot(
  property: Property,
  portfolio: Portfolio,
  assumptions: Assumptions,
  asOf: IsoDate = assumptions.baseDate,
  schedule?: AmortizationRow[],
): PropertySnapshot {
  const v = assertInputs(portfolio, assumptions); // ADR 0037
  assertAsOf(asOf, assumptions.baseDate); // ADR 0019: no snapshot before the projection start
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
 * checked, with the rate `portfolioSnapshot` weights by the debt (ADR 0177).
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
    active: isActive(property),
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
 * Portfolio snapshot at `asOf`. Pass `schedules` (the rows from `propertySchedules` on
 * the same inputs) to reuse them; omitted ones are built here.
 * @internal test seam: tests pin it; the app runs `portfolioOutputs`.
 */
export function portfolioSnapshot(
  portfolio: Portfolio,
  assumptions: Assumptions,
  asOf: IsoDate = assumptions.baseDate,
  schedules?: Map<string, AmortizationRow[]>,
): PortfolioSnapshot {
  const v = assertInputs(portfolio, assumptions); // ADR 0037
  // ADR 0019, checked once so an empty portfolio raises too (ADR 0075).
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
 * (`assertAsOf`) and the rows of every property's schedule.
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
