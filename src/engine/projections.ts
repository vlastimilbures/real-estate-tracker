// Annual projection per property and for the portfolio, and the CPI index behind real
// terms (SPEC §4.5). KPIs are computed from this projection in ./kpis.
import { powInt, ZERO, ONE, type Decimal } from "../lib/money";
import { addYears, byStart, edate, isAfter, isOnOrBefore } from "./dates";
import { at } from "./arrays";
import {
  EMPTY_PROPERTY_SCHEDULE,
  openingDebt,
  propertySchedules,
  undrawnPrincipal,
  type PropertySchedule,
} from "./schedule";
import { firstActiveGridMonth, turnOnYear, yearSlice } from "./yearGrid";
import {
  cashOutsideNetCf,
  prePurchaseDebtService,
  type DebtServicePaid,
} from "./ownerCash";
import {
  assertAssumptions,
  assertInputs,
  type ValidAssumptions,
  type ValidInputs,
} from "./validate";
import { decimalsOf, fieldsOf } from "./yearFields";
import { basisDate, growthRate, valueAt } from "./growth";
import {
  valueAnchor,
  growthYears,
  leaseInForce,
  forProperty,
  holdingCostBasis,
} from "./metrics";
import { costsAndNoi, dscrOf, stocksOf } from "./figures";
import type {
  Assumptions,
  Lease,
  Portfolio,
  Property,
  Valuation,
  ProjectionYear,
  AmortizationRow,
  MortgageBlock,
} from "./types";
import { yearsToMonths } from "./units";

/**
 * Cumulative consumer-price index by projection year: `cpi[t] = ∏_{k=1..t}(1+infl_k)`,
 * where `infl_k = inflationPa + (k ≤ inflationShock.durationYears ? deltaPa : 0)` and
 * `cpi[0] = 1`. A temporary inflation shock thus compounds into the index for its first
 * `durationYears`, after which the trend rate resumes. With no `inflationShock` this
 * equals `powInt(1+inflationPa, t)` exactly, so holding-cost growth and the real-terms
 * deflator reproduce the parity targets. Length `horizonYears + 1`. Takes validated
 * assumptions only; `cpiIndex` validates them first.
 */
export function buildCpiIndex(assumptions: ValidAssumptions): Decimal[] {
  const cpi: Decimal[] = [ONE];
  for (let t = 1; t <= assumptions.horizonYears; t++) {
    cpi.push(at(cpi, t - 1).times(ONE.plus(inflationInYear(assumptions, t))));
  }
  return cpi;
}

/** `buildCpiIndex` for callers outside the engine: raises the D-37 / D-38 problems of
 *  the assumptions first (ADR 0075, DR-115). */
export function cpiIndex(assumptions: Assumptions): Decimal[] {
  return buildCpiIndex(assertAssumptions(assumptions));
}

/** Inflation rate of projection year `t` (≥ 1): the trend plus any shock in force. */
export function inflationInYear(assumptions: Assumptions, t: number): Decimal {
  const { inflationPa, inflationShock } = assumptions;
  return inflationShock && t <= inflationShock.durationYears
    ? inflationPa.plus(inflationShock.deltaPa)
    : inflationPa;
}

/** A lease's rent as the projection uses it: monthly, indexed from year `tIndex`. */
interface RentTerm {
  monthlyRent: Decimal;
  tIndex: number;
}

interface PropertyBasis {
  v0: Decimal;
  valuations: Valuation[]; // this property's valuations, for per-year re-anchoring
  rentPlan: (RentTerm | undefined)[]; // per grid month (index m − 1); undefined = no rent
  fixed0: Decimal;
  mgmtPct: Decimal; // management share of rent
  maintPct: Decimal; // maintenance share of rent
  g: Decimal; // appreciation
  idx: Decimal; // rent indexation
  schedule: AmortizationRow[];
}

function propertyBasis(
  property: Property,
  portfolio: Portfolio,
  assumptions: Assumptions,
  schedule: AmortizationRow[],
): PropertyBasis {
  // For a future purchase, capture the basis (valuation/lease/costs) as of the
  // purchase date — at baseDate nothing is in force yet, which would otherwise
  // project zero rent forever. Past purchases collapse to baseDate (unchanged).
  const asOf = basisDate(property, assumptions.baseDate);
  const valuations = forProperty(portfolio.valuations, property.id);
  // The snapshot's anchored value at the basis date (`valueAnchor`): before the first
  // recorded valuation, the nearest upcoming one rather than the stale purchase
  // price — so year 0 lines up with the snapshot tile (no jump, one fallback rule).
  const v0 = valueAnchor(valuations, property, assumptions, asOf).value;
  const rentPlan = buildRentPlan(
    forProperty(portfolio.leases, property.id),
    asOf,
    assumptions,
  );
  const {
    fixed: fixed0,
    mgmtPct,
    maintPct,
  } = holdingCostBasis(property, portfolio, assumptions);
  const g = growthRate(property, assumptions);
  const idx = property.rentIndexOverridePa ?? assumptions.rentIndexationPa;
  return {
    v0,
    valuations,
    rentPlan,
    fixed0,
    mgmtPct,
    maintPct,
    g,
    idx,
    schedule,
  };
}

/**
 * The lease the projection keeps renting past its end date, treated as renewed: the last
 * lease (latest start) when it has an end date on or after the basis date. Shared by the
 * rent plan and the data check (ADR 0118).
 */
export function renewedLease(leases: Lease[], basis: Date): Lease | undefined {
  const last = [...leases].sort(byStart((l) => l.startDate)).at(-1);
  return last?.endDate !== undefined && isOnOrBefore(basis, last.endDate)
    ? last
    : undefined;
}

/**
 * The rent of every grid month (DR-045, ADR 0080): the lease in force on the month's
 * grid date `edate(baseDate, m)` (D-21), from the first month on/after the basis date;
 * no lease in force ⇒ no rent (a gap between leases). The last lease (latest start)
 * keeps renting past its end date — treated as renewed — unless it ended before the
 * basis date. Each lease's rent is indexed from its own turn-on year.
 */
function buildRentPlan(
  leases: Lease[],
  basis: Date,
  assumptions: Assumptions,
): (RentTerm | undefined)[] {
  const renewed = renewedLease(leases, basis);
  const inPlan = leases.map((l) =>
    l === renewed ? { ...l, endDate: undefined } : l,
  );
  const terms = new Map<Lease, RentTerm>();
  const termOf = (l: Lease): RentTerm => {
    let term = terms.get(l);
    if (!term) {
      const from = isAfter(l.startDate, basis) ? l.startDate : basis;
      term = {
        monthlyRent: l.monthlyRent,
        tIndex: turnOnYear(from, assumptions),
      };
      terms.set(l, term);
    }
    return term;
  };
  const months = yearsToMonths(assumptions.horizonYears);
  const first = firstActiveGridMonth(basis, assumptions);
  const plan: (RentTerm | undefined)[] = [];
  for (let m = 1; m <= months; m++) {
    const lease =
      m < first
        ? undefined
        : leaseInForce(inPlan, edate(assumptions.baseDate, m));
    plan.push(lease && termOf(lease));
  }
  return plan;
}

/**
 * Debt on a schedule at the end of grid month `m`: the baseDate debt for m = 0 (a
 * grid-month-1 draw is not debt yet, D-33, D-44), else that row's end balance.
 */
function debtAtGridMonth(
  schedule: AmortizationRow[],
  blocks: MortgageBlock[],
  assumptions: Assumptions,
  m: number,
): Decimal {
  if (schedule.length === 0) return ZERO;
  return m === 0
    ? openingDebt(blocks, assumptions)
    : at(schedule, m - 1).endBalance;
}

/** A property's turn-on gating: the year/month a property comes online. */
interface TurnOnGates {
  tStart: number;
  firstOwnedMonth: number;
}

/**
 * Projection year at which the property comes online: the year-slice that contains
 * the purchase date on the baseDate-anchored month grid — the same grid the
 * amortization schedule draws on, so value/rent/debt switch on together (no phantom
 * debt-free first year). 0 for already-owned properties, so every exponent elsewhere
 * stays `t` and existing output is unchanged. Rent follows the leases month by month
 * (`buildRentPlan`). The month grid pro-rates the partial turn-on bucket: it collapses
 * to "all year" for the seed (purchases predate baseDate).
 */
function computeTurnOnGates(
  property: Property,
  assumptions: Assumptions,
): TurnOnGates {
  return {
    tStart: turnOnYear(property.purchaseDate, assumptions),
    firstOwnedMonth: firstActiveGridMonth(property.purchaseDate, assumptions),
  };
}

/**
 * One property's projection inputs, built once per property (#480): its basis, loan
 * blocks, turn-on gates and CPI index, the value after any timed value correction
 * (`crash`) and its development principal not drawn yet at each year end (`undrawn`).
 */
interface PropertyRun {
  property: Property;
  assumptions: ValidAssumptions;
  basis: PropertyBasis;
  blocks: MortgageBlock[];
  gates: TurnOnGates;
  cpi: Decimal[];
  crash: (value: Decimal, t: number) => Decimal;
  undrawn: (t: number) => Decimal;
}

function propertyRun(
  property: Property,
  v: ValidInputs,
  schedule: AmortizationRow[],
): PropertyRun {
  const { portfolio, assumptions } = v;
  const basis = propertyBasis(property, portfolio, assumptions, schedule);
  const cpi = buildCpiIndex(assumptions);
  // A timed, permanent value correction: from projection year `atYear` the value curve
  // is scaled by `1 − pct` and growth resumes from the lower base (debt & rent untouched).
  // Applied as the outermost multiply (after re-anchor); undefined ⇒ no change.
  const vs = assumptions.valueShock;
  const crash = (value: Decimal, t: number): Decimal =>
    vs && t >= vs.atYear ? value.times(ONE.minus(vs.pct)) : value;
  const gates = computeTurnOnGates(property, assumptions);
  const blocks = forProperty(portfolio.mortgages, property.id);
  // Development principal not drawn yet at each year end, 0 before the property is
  // owned (ADR 0166).
  const undrawn = (t: number): Decimal =>
    t < gates.tStart
      ? ZERO
      : undrawnPrincipal(property, blocks, assumptions, yearsToMonths(t));
  return { property, assumptions, basis, blocks, gates, cpi, crash, undrawn };
}

/** Year 0 — opening position (stocks only). Empty if not owned yet. */
function buildYear0(run: PropertyRun): YearRow {
  const { basis: b, assumptions } = run;
  const baseYear = assumptions.baseDate.getUTCFullYear();
  if (run.gates.tStart > 0) return zeroYear(0, baseYear, assumptions.baseDate);
  const undrawn0 = run.undrawn(0);
  // The debt at baseDate, not grid month 1's opening balance: a loan drawn after
  // baseDate is new debt in its year, not opening debt (D-33).
  const balance0 = debtAtGridMonth(b.schedule, run.blocks, assumptions, 0);
  return {
    ...zeroYear(0, baseYear, assumptions.baseDate),
    ...stocksOf(run.crash(b.v0, 0), balance0, undrawn0),
  };
}

/**
 * Value for projection year `t`, the snapshot's value at the year's date (D-32): the
 * same anchored value (`valueAnchor`), grown by whole completed months / 12 from a later
 * anchor (a valuation dated after the basis, or the purchase date of a future buy). On
 * the baseDate anchor the growth is exactly `t` years, the parity path.
 */
function computeValueForYear(
  run: PropertyRun,
  t: number,
  yearDate: Date,
): Decimal {
  const { basis: b, assumptions } = run;
  const { value, anchor } = valueAnchor(
    b.valuations,
    run.property,
    assumptions,
    yearDate,
  );
  const years =
    anchor.getTime() === assumptions.baseDate.getTime()
      ? t
      : growthYears(anchor, yearDate);
  return run.crash(valueAt(value, b.g, years), t);
}

interface RentAndCosts {
  grossRent: Decimal;
  effectiveRent: Decimal;
  holdingCosts: Decimal;
  noi: Decimal;
}

/**
 * Rent for year `t`: each lease's indexed monthly rent (off its own turn-on year) times
 * its months in the year's slice of the rent plan. Fixed holding costs are base-date
 * prices inflated from the base date, `fixed0 × CPI_t` (SPEC §4.5; a future purchase is
 * not rebased to its turn-on year, ADR 0165), pro-rated by months owned in the turn-on
 * year (12 once owned from a prior year).
 */
function computeRentAndCosts(run: PropertyRun, t: number): RentAndCosts {
  const b = run.basis;
  const ownedMonths = activeMonthsInYear(run.gates.firstOwnedMonth, t);
  const monthsLet = new Map<RentTerm, number>();
  for (const term of b.rentPlan.slice(yearsToMonths(t - 1), yearsToMonths(t))) {
    if (term) monthsLet.set(term, (monthsLet.get(term) ?? 0) + 1);
  }
  let grossRent = ZERO;
  for (const [term, months] of monthsLet) {
    grossRent = grossRent.plus(
      term.monthlyRent
        .times(powInt(ONE.plus(b.idx), t - term.tIndex))
        .times(months),
    );
  }
  const fixed = b.fixed0.times(at(run.cpi, t)).times(ownedMonths).div(12);
  return {
    grossRent,
    ...costsAndNoi(
      fixed,
      grossRent,
      run.assumptions.vacancyAllowance,
      b.mgmtPct,
      b.maintPct,
    ),
  };
}

/** What a projection year row is built from (`buildYearRow`). */
interface YearInputs {
  value: Decimal;
  rc: RentAndCosts;
  slice: ReturnType<typeof yearSlice>;
  draws: Decimal;
  acquiredValue: Decimal;
  undrawn: Decimal;
  undrawnBefore: Decimal;
}

/** Projection year `t` ≥ 1 of an owned property. */
function propertyYear(run: PropertyRun, t: number): YearRow {
  const { basis: b, assumptions } = run;
  const { tStart } = run.gates;
  const yearDate = addYears(assumptions.baseDate, t);
  const value = computeValueForYear(run, t, yearDate);
  const rc = computeRentAndCosts(run, t);
  const slice = yearSlice(b.schedule, t);
  // In a later turn-on year the debt the property comes online with is new to it
  // (the years before are empty), so it counts as drawn (DR-092).
  const turnsOn = t === tStart && tStart > 0;
  const carriedIn = turnsOn
    ? debtAtGridMonth(b.schedule, run.blocks, assumptions, yearsToMonths(t - 1))
    : ZERO;
  return buildYearRow(t, assumptions.baseDate, {
    value,
    rc,
    slice,
    draws: slice.drawn.plus(carriedIn),
    // ADR 0165: the value it comes online with is its value at the purchase date
    // (the basis is anchored there), bought in rather than appreciation. A
    // development flat comes in at its completed value (ADR 0166).
    acquiredValue: turnsOn ? run.crash(b.v0, t) : ZERO,
    undrawn: run.undrawn(t),
    undrawnBefore: run.undrawn(t - 1),
  });
}

function buildYearRow(t: number, baseDate: Date, f: YearInputs): YearRow {
  const { rc, slice, draws, acquiredValue } = f;
  const netCashFlow = rc.noi.minus(slice.debtService);
  return {
    year: t,
    calendarYear: baseDate.getUTCFullYear() + t,
    ...yearPeriod(baseDate, t),
    ...stocksOf(f.value, slice.balance, f.undrawn),
    grossRent: rc.grossRent,
    effectiveRent: rc.effectiveRent,
    holdingCosts: rc.holdingCosts,
    noi: rc.noi,
    interest: slice.interest,
    principal: slice.principal,
    debtService: slice.debtService,
    netCashFlow,
    draws,
    // A tranche drawn this year was already committed (ADR 0166).
    committedDraws: draws.minus(f.undrawnBefore.minus(f.undrawn)),
    acquiredValue,
    refinanced: slice.refinanced,
    prepaid: slice.prepaid,
    prepaymentFees: slice.prepaymentFees,
    dscr: dscrOf(rc.noi, slice.debtService),
    ratePa: slice.rate,
  };
}

/** Per-property 30-year projection (years 0..horizon). */
export function propertyProjection(
  property: Property,
  portfolio: Portfolio,
  assumptions: Assumptions,
  schedule: PropertySchedule,
): ProjectionYear[] {
  const v = assertInputs(portfolio, assumptions); // D-37
  return projectProperty(property, v, schedule);
}

/** Every property's `propertyProjection` by id, inactive ones included, validating the
 *  portfolio once (DR-128). Pass `schedules` to reuse them (DR-042). */
export function propertyProjections(
  portfolio: Portfolio,
  assumptions: Assumptions,
  schedules?: Map<string, PropertySchedule>,
): Map<string, ProjectionYear[]> {
  const v = assertInputs(portfolio, assumptions); // D-37
  const built =
    schedules ??
    propertySchedules(
      portfolio.mortgages,
      portfolio.properties.map((p) => p.id),
      assumptions,
    );
  return new Map(
    portfolio.properties.map((p) => [
      p.id,
      projectProperty(p, v, built.get(p.id) ?? EMPTY_PROPERTY_SCHEDULE),
    ]),
  );
}

/** `propertyProjection` on validated inputs (DR-128). */
function projectProperty(
  property: Property,
  v: ValidInputs,
  built: PropertySchedule,
): ProjectionYear[] {
  const years = propertyYears(property, v, built.rows);
  const own = new Map([[property.id, built]]);
  return withCashToOwner(
    years,
    cashOutsideNetCf([property], v.portfolio, v.assumptions, own, years),
  );
}

/** A property's projection years before their cash to owner (ADR 0161). */
function propertyYears(
  property: Property,
  v: ValidInputs,
  schedule: AmortizationRow[],
): YearRow[] {
  const run = propertyRun(property, v, schedule);
  const { baseDate, horizonYears } = run.assumptions;
  const baseYear = baseDate.getUTCFullYear();
  const years: YearRow[] = [buildYear0(run)];
  for (let t = 1; t <= horizonYears; t++) {
    years.push(
      t < run.gates.tStart
        ? zeroYear(t, baseYear + t, baseDate)
        : propertyYear(run, t),
    );
  }
  return years;
}

/** A projection year before its `cashToOwner` is known (ADR 0161). */
type YearRow = Omit<ProjectionYear, "cashToOwner">;

/** A row's stocks (summed and derived), its summed stocks and its flows, in the
 *  order of `YEAR_FIELD_KINDS` (#478). */
const STOCK_FIELDS = fieldsOf("stock", "derivedStock");
const SUMMED_STOCK_FIELDS = fieldsOf("stock");
const FLOW_FIELDS = fieldsOf("flow");
type SummedField =
  (typeof SUMMED_STOCK_FIELDS)[number] | (typeof FLOW_FIELDS)[number];

/**
 * ADR 0161: each year's cash to owner = net cash flow − the cash outside it
 * (`cashOutsideNetCf` of the same properties); year 0 is the opening position, 0.
 */
function withCashToOwner(
  years: YearRow[],
  outside: Decimal[],
): ProjectionYear[] {
  return years.map((y, t) => ({
    ...y,
    cashToOwner: t === 0 ? ZERO : y.netCashFlow.minus(at(outside, t)),
  }));
}

/**
 * Months of projection year `t` (grid months (t-1)*12+1 .. t*12) during which an item
 * first active at `firstGridMonth` is live: 12 once it started in a prior year, the
 * partial count in its turn-on year, 0 before.
 */
function activeMonthsInYear(firstGridMonth: number, t: number): number {
  const active =
    yearsToMonths(t) - Math.max(yearsToMonths(t - 1), firstGridMonth - 1);
  return Math.max(0, Math.min(12, active));
}

/**
 * Projection year `t`'s period (D-22): grid months 12(t−1)+1 … 12t, i.e. the dates
 * (periodStart, periodEnd], on the month-end-clamped grid (D-21). Year 0 is baseDate.
 */
function yearPeriod(baseDate: Date, t: number) {
  return {
    periodStart: edate(baseDate, yearsToMonths(Math.max(0, t - 1))),
    periodEnd: edate(baseDate, yearsToMonths(t)),
  };
}

/** A fully-empty projection year for periods before a property is owned. */
function zeroYear(year: number, calendarYear: number, baseDate: Date): YearRow {
  return {
    year,
    calendarYear,
    ...yearPeriod(baseDate, year),
    ...decimalsOf(STOCK_FIELDS),
    ltv: ZERO,
    ...decimalsOf(FLOW_FIELDS),
    dscr: null,
    ratePa: null,
  };
}

/**
 * Portfolio projection = element-wise sum of property projections by year. Pass
 * `schedules` (from `propertySchedules` on the same inputs) to reuse them (DR-042).
 */
export function portfolioProjection(
  portfolio: Portfolio,
  assumptions: Assumptions,
  schedules?: Map<string, PropertySchedule>,
): ProjectionYear[] {
  const v = assertInputs(portfolio, assumptions); // D-37
  const built =
    schedules ??
    propertySchedules(
      portfolio.mortgages,
      portfolio.properties.map((p) => p.id),
      assumptions,
    );
  return projectPortfolioParts(v, built).years;
}

/**
 * `portfolioProjection` on validated inputs and their schedules (DR-128): the portfolio
 * is checked once per public call, not again per property. Also returns the debt service
 * paid before a future buy turns on (ADR 0124), so the KPIs reuse it (#291).
 */
export function projectPortfolioParts(
  v: ValidInputs,
  schedules: Map<string, PropertySchedule>,
): { years: ProjectionYear[]; prePurchase: DebtServicePaid[] } {
  const { portfolio, assumptions } = v;
  const active = portfolio.properties.filter((p) => p.active !== false);
  // The property years without their own cash to owner: the portfolio's is computed
  // once below, not summed from them.
  const perProp = active.map((p) =>
    propertyYears(p, v, (schedules.get(p.id) ?? EMPTY_PROPERTY_SCHEDULE).rows),
  );
  const out = sumYears(perProp, assumptions);
  const prePurchase = prePurchaseDebtService(active, assumptions, schedules);
  // Σ net cash flow − the portfolio's cash outside it, not Σ of the property rows: the
  // KPIs sum these, and another summation order would move their last digits.
  const years = withCashToOwner(
    out,
    cashOutsideNetCf(
      active,
      portfolio,
      assumptions,
      schedules,
      out,
      prePurchase,
    ),
  );
  return { years, prePurchase };
}

/** The portfolio's year rows: each field summed across the property years. */
function sumYears(perProp: YearRow[][], assumptions: Assumptions): YearRow[] {
  const baseYear = assumptions.baseDate.getUTCFullYear();
  const out: YearRow[] = [];
  for (let t = 0; t <= assumptions.horizonYears; t++) {
    // Each field summed in portfolio order from 0; net cash flow is Σ net cash flow.
    const acc = (f: SummedField) =>
      perProp.reduce((s, yrs) => s.plus(at(yrs, t)[f]), ZERO);
    const st = decimalsOf(SUMMED_STOCK_FIELDS, acc);
    const flows = decimalsOf(FLOW_FIELDS, acc);
    out.push({
      year: t,
      calendarYear: baseYear + t,
      ...yearPeriod(assumptions.baseDate, t),
      ...stocksOf(st.value, st.balance, st.undrawnDebt, st.committedDebt),
      ...flows,
      dscr: dscrOf(flows.noi, flows.debtService),
      ratePa: null,
    });
  }
  return out;
}
