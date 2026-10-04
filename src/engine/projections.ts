// Annual projection per property and for the portfolio, and the CPI index behind real
// terms (SPEC §4.5). KPIs are computed from this projection in ./kpis.
import { powInt, ZERO, ONE, type Decimal } from "../lib/money";
import {
  addYears,
  edate,
  firstGridMonthOnOrAfter,
  isAfter,
  isOnOrBefore,
} from "./dates";
import { isDevLoan } from "./amortization";
import { at } from "./arrays";
import { schedulesByProperty, openingDebt } from "./schedule";
import { assertAssumptions, assertInputs } from "./validate";
import { basisDate, valueAt, drawnFraction } from "./growth";
import {
  valueAnchor,
  growthYears,
  openingValue,
  leaseInForce,
  effectiveCosts,
  fixedHoldingCost,
  forProperty,
} from "./metrics";
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

/**
 * Cumulative consumer-price index by projection year: `cpi[t] = ∏_{k=1..t}(1+infl_k)`,
 * where `infl_k = inflationPa + (k ≤ inflationShock.durationYears ? deltaPa : 0)` and
 * `cpi[0] = 1`. A temporary inflation shock thus compounds into the index for its first
 * `durationYears`, after which the trend rate resumes. With no `inflationShock` this
 * equals `powInt(1+inflationPa, t)` exactly, so holding-cost growth and the real-terms
 * deflator reproduce the parity targets. Length `horizonYears + 1`.
 */
export function buildCpiIndex(assumptions: Assumptions): Decimal[] {
  const cpi: Decimal[] = [ONE];
  for (let t = 1; t <= assumptions.horizonYears; t++) {
    cpi.push(at(cpi, t - 1).times(ONE.plus(inflationInYear(assumptions, t))));
  }
  return cpi;
}

/** `buildCpiIndex` for callers outside the engine: raises the D-37 / D-38 problems of
 *  the assumptions first (ADR 0075, DR-115). */
export function cpiIndex(assumptions: Assumptions): Decimal[] {
  assertAssumptions(assumptions);
  return buildCpiIndex(assumptions);
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
  basisDate: Date; // date v0 is anchored at (baseDate, or purchaseDate for a future buy)
  valuations: Valuation[]; // this property's valuations, for per-year re-anchoring
  rentPlan: (RentTerm | undefined)[]; // per grid month (index m − 1); undefined = no rent
  fixed0: Decimal;
  varPct: Decimal; // mgmt + maint
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
  // Prefer the valuation in force at the basis date; if none yet (baseDate predates
  // the first recorded valuation), use the nearest upcoming one rather than the
  // stale purchase price — so year 0 lines up with the snapshot tile (no jump).
  const v0 = openingValue(valuations, property, asOf);
  const rentPlan = buildRentPlan(
    forProperty(portfolio.leases, property.id),
    asOf,
    assumptions,
  );
  const cost = forProperty(portfolio.holdingCosts, property.id).at(0);
  const c = effectiveCosts(cost, assumptions);
  const fixed0 = fixedHoldingCost(c);
  const varPct = c.mgmtPctRent.plus(c.maintPctRent);
  const g = property.appreciationOverridePa ?? assumptions.appreciationPa;
  const idx = property.rentIndexOverridePa ?? assumptions.rentIndexationPa;
  return {
    v0,
    basisDate: asOf,
    valuations,
    rentPlan,
    fixed0,
    varPct,
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
  const last = [...leases]
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
    .at(-1);
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
  const months = assumptions.horizonYears * 12;
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

/** Sum a schedule's months for projection year t (months (t-1)*12+1 .. t*12). */
function yearSlice(schedule: AmortizationRow[], t: number) {
  const start = (t - 1) * 12;
  const end = t * 12;
  let interest = ZERO;
  let principal = ZERO;
  let drawn = ZERO;
  let prepaid = ZERO;
  let prepaymentFees = ZERO;
  let balance = ZERO;
  let lastRate: Decimal | null = null;
  for (const row of schedule.slice(start, end)) {
    interest = interest.plus(row.interest);
    principal = principal.plus(row.principal);
    drawn = drawn.plus(row.drawn);
    prepaid = prepaid.plus(row.prepaid);
    prepaymentFees = prepaymentFees.plus(row.prepaymentFee);
    balance = row.endBalance;
    if (row.principal.plus(row.interest).isPositive()) {
      lastRate = row.ratePa;
    }
  }
  return {
    interest,
    principal,
    debtService: interest.plus(principal),
    drawn,
    prepaid,
    prepaymentFees,
    balance,
    rate: lastRate,
  };
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

/** Year 0 — opening position (stocks only). Empty if not owned yet. */
function buildYear0(
  b: PropertyBasis,
  blocks: MortgageBlock[],
  assumptions: Assumptions,
  baseYear: number,
  tStart: number,
  crash: (value: Decimal, t: number) => Decimal,
  ramp: (value: Decimal, date: Date) => Decimal,
): ProjectionYear {
  if (tStart > 0) return zeroYear(0, baseYear, assumptions.baseDate);
  // The debt at baseDate, not grid month 1's opening balance: a loan drawn after
  // baseDate is new debt in its year, not opening debt (D-33).
  const balance0 =
    b.schedule.length > 0 ? openingDebt(blocks, assumptions) : ZERO;
  const value0 = crash(ramp(b.v0, assumptions.baseDate), 0);
  return {
    year: 0,
    calendarYear: baseYear,
    ...yearPeriod(assumptions.baseDate, 0),
    value: value0,
    balance: balance0,
    equity: value0.minus(balance0),
    ltv: value0.isZero() ? ZERO : balance0.div(value0),
    grossRent: ZERO,
    effectiveRent: ZERO,
    holdingCosts: ZERO,
    noi: ZERO,
    interest: ZERO,
    principal: ZERO,
    debtService: ZERO,
    netCashFlow: ZERO,
    draws: ZERO,
    prepaid: ZERO,
    prepaymentFees: ZERO,
    dscr: null,
    ratePa: null,
  };
}

/**
 * Value for projection year `t`, the snapshot's value at the year's date (D-32): the
 * same anchored value (`valueAnchor`), grown by whole completed months / 12 from a later
 * anchor (a valuation dated after the basis, or the purchase date of a future buy). On
 * the baseDate anchor the growth is exactly `t` years, the parity path.
 */
function computeValueForYear(
  b: PropertyBasis,
  property: Property,
  assumptions: Assumptions,
  t: number,
  yearDate: Date,
  crash: (value: Decimal, t: number) => Decimal,
  ramp: (value: Decimal, date: Date) => Decimal,
): Decimal {
  const { value, anchor } = valueAnchor(
    b.valuations,
    property,
    assumptions,
    yearDate,
  );
  const years =
    anchor.getTime() === assumptions.baseDate.getTime()
      ? t
      : growthYears(anchor, yearDate);
  return crash(ramp(valueAt(value, b.g, years), yearDate), t);
}

interface RentAndCosts {
  grossRent: Decimal;
  effectiveRent: Decimal;
  holdingCosts: Decimal;
  noi: Decimal;
}

/**
 * Rent for year `t`: each lease's indexed monthly rent (off its own turn-on year) times
 * its months in the year's slice of the rent plan. Holding costs pro-rated by months
 * owned in the turn-on year (12 once owned from a prior year).
 */
function computeRentAndCosts(
  b: PropertyBasis,
  gates: TurnOnGates,
  t: number,
  cpi: Decimal[],
  vacancy: Decimal,
): RentAndCosts {
  const ownedMonths = activeMonthsInYear(gates.firstOwnedMonth, t);
  const monthsLet = new Map<RentTerm, number>();
  for (const term of b.rentPlan.slice((t - 1) * 12, t * 12)) {
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
  const effectiveRent = grossRent.times(ONE.minus(vacancy));
  const holdingCosts = b.fixed0
    .times(at(cpi, t).div(at(cpi, gates.tStart)))
    .times(ownedMonths)
    .div(12)
    .plus(b.varPct.times(grossRent));
  const noi = effectiveRent.minus(holdingCosts);
  return { grossRent, effectiveRent, holdingCosts, noi };
}

function buildYearRow(
  t: number,
  baseDate: Date,
  value: Decimal,
  rc: RentAndCosts,
  slice: ReturnType<typeof yearSlice>,
  draws: Decimal,
): ProjectionYear {
  const netCashFlow = rc.noi.minus(slice.debtService);
  return {
    year: t,
    calendarYear: baseDate.getUTCFullYear() + t,
    ...yearPeriod(baseDate, t),
    value,
    balance: slice.balance,
    equity: value.minus(slice.balance),
    ltv: value.isZero() ? ZERO : slice.balance.div(value),
    grossRent: rc.grossRent,
    effectiveRent: rc.effectiveRent,
    holdingCosts: rc.holdingCosts,
    noi: rc.noi,
    interest: slice.interest,
    principal: slice.principal,
    debtService: slice.debtService,
    netCashFlow,
    draws,
    prepaid: slice.prepaid,
    prepaymentFees: slice.prepaymentFees,
    dscr: slice.debtService.isZero() ? null : rc.noi.div(slice.debtService),
    ratePa: slice.rate,
  };
}

/** Per-property 30-year projection (years 0..horizon). */
export function propertyProjection(
  property: Property,
  portfolio: Portfolio,
  assumptions: Assumptions,
  schedule: AmortizationRow[],
): ProjectionYear[] {
  assertInputs(portfolio, assumptions); // D-37
  return projectProperty(property, portfolio, assumptions, schedule);
}

/** `propertyProjection` on inputs the caller has already validated (DR-128). */
function projectProperty(
  property: Property,
  portfolio: Portfolio,
  assumptions: Assumptions,
  schedule: AmortizationRow[],
): ProjectionYear[] {
  const b = propertyBasis(property, portfolio, assumptions, schedule);
  const baseYear = assumptions.baseDate.getUTCFullYear();
  const vacancy = assumptions.vacancyAllowance;
  const cpi = buildCpiIndex(assumptions);
  const years: ProjectionYear[] = [];

  // A timed, permanent value correction: from projection year `atYear` the value curve
  // is scaled by `1 − pct` and growth resumes from the lower base (debt & rent untouched).
  // Applied as the outermost multiply (after ramp/re-anchor); undefined ⇒ no change.
  const vs = assumptions.valueShock;
  const crash = (value: Decimal, t: number): Decimal =>
    vs && t >= vs.atYear ? value.times(ONE.minus(vs.pct)) : value;

  // Development property: the valuation is the *completed* value, so scale it by the
  // construction-progress (drawn) fraction at each year's date. Resolved once; for a
  // non-dev property `ramp` is the identity, so the value curve is unchanged.
  const devBlock = forProperty(portfolio.mortgages, property.id).find(
    isDevLoan,
  );
  const ramp = (value: Decimal, date: Date): Decimal =>
    devBlock ? value.times(drawnFraction(devBlock, date)) : value;

  const gates = computeTurnOnGates(property, assumptions);
  const { tStart } = gates;

  const blocks = forProperty(portfolio.mortgages, property.id);
  years.push(buildYear0(b, blocks, assumptions, baseYear, tStart, crash, ramp));

  for (let t = 1; t <= assumptions.horizonYears; t++) {
    if (t < tStart) {
      years.push(zeroYear(t, baseYear + t, assumptions.baseDate));
      continue;
    }
    const yearDate = addYears(assumptions.baseDate, t);
    const value = computeValueForYear(
      b,
      property,
      assumptions,
      t,
      yearDate,
      crash,
      ramp,
    );
    const rc = computeRentAndCosts(b, gates, t, cpi, vacancy);
    const slice = yearSlice(schedule, t);
    // In a later turn-on year the debt the property comes online with is new to it
    // (the years before are empty), so it counts as drawn (DR-092).
    const carriedIn =
      t === tStart && tStart > 0
        ? debtAtGridMonth(schedule, blocks, assumptions, (t - 1) * 12)
        : ZERO;
    years.push(
      buildYearRow(
        t,
        assumptions.baseDate,
        value,
        rc,
        slice,
        slice.drawn.plus(carriedIn),
      ),
    );
  }
  return years;
}

/**
 * 1-based baseDate grid month in which `date` first becomes active. Returns 1 when
 * `date ≤ baseDate` (already owned/let ⇒ active the whole horizon, so the seed keeps
 * 12 months/year and parity holds), else the first month grid point on/after it,
 * else horizon+1 (never active in-window).
 */
function firstActiveGridMonth(date: Date, assumptions: Assumptions): number {
  const { baseDate, horizonYears } = assumptions;
  if (isOnOrBefore(date, baseDate)) return 1;
  return firstGridMonthOnOrAfter(baseDate, date, horizonYears * 12);
}

/**
 * Months of projection year `t` (grid months (t-1)*12+1 .. t*12) during which an item
 * first active at `firstGridMonth` is live: 12 once it started in a prior year, the
 * partial count in its turn-on year, 0 before.
 */
function activeMonthsInYear(firstGridMonth: number, t: number): number {
  const active = t * 12 - Math.max((t - 1) * 12, firstGridMonth - 1);
  return Math.max(0, Math.min(12, active));
}

/**
 * Projection year-slice (1..horizon) containing `date`, matching where
 * `buildSchedule` first draws a future loan (first month grid point ≥ date).
 * Returns 0 when the date is on/before baseDate (already owned → no gating), and
 * horizon+1 when it falls beyond the horizon (property never appears).
 */
export function turnOnYear(date: Date, assumptions: Assumptions): number {
  const { baseDate, horizonYears } = assumptions;
  if (isOnOrBefore(date, baseDate)) return 0;
  const m = firstGridMonthOnOrAfter(baseDate, date, horizonYears * 12);
  return m > horizonYears * 12 ? horizonYears + 1 : Math.ceil(m / 12);
}

/**
 * Projection year `t`'s period (D-22): grid months 12(t−1)+1 … 12t, i.e. the dates
 * (periodStart, periodEnd], on the month-end-clamped grid (D-21). Year 0 is baseDate.
 */
function yearPeriod(baseDate: Date, t: number) {
  return {
    periodStart: edate(baseDate, Math.max(0, t - 1) * 12),
    periodEnd: edate(baseDate, t * 12),
  };
}

/** A fully-empty projection year for periods before a property is owned. */
function zeroYear(
  year: number,
  calendarYear: number,
  baseDate: Date,
): ProjectionYear {
  return {
    year,
    calendarYear,
    ...yearPeriod(baseDate, year),
    value: ZERO,
    balance: ZERO,
    equity: ZERO,
    ltv: ZERO,
    grossRent: ZERO,
    effectiveRent: ZERO,
    holdingCosts: ZERO,
    noi: ZERO,
    interest: ZERO,
    principal: ZERO,
    debtService: ZERO,
    netCashFlow: ZERO,
    draws: ZERO,
    prepaid: ZERO,
    prepaymentFees: ZERO,
    dscr: null,
    ratePa: null,
  };
}

/**
 * Portfolio projection = element-wise sum of property projections by year. Pass
 * `schedules` (from `schedulesByProperty` on the same inputs) to reuse them (DR-042).
 */
export function portfolioProjection(
  portfolio: Portfolio,
  assumptions: Assumptions,
  schedules?: Map<string, AmortizationRow[]>,
): ProjectionYear[] {
  assertInputs(portfolio, assumptions); // D-37
  return projectPortfolio(portfolio, assumptions, schedules);
}

/**
 * `portfolioProjection` on inputs the caller has already validated (DR-128): the
 * portfolio is checked once per public call, not again per property.
 */
export function projectPortfolio(
  portfolio: Portfolio,
  assumptions: Assumptions,
  schedules = schedulesByProperty(
    portfolio.mortgages,
    portfolio.properties.map((p) => p.id),
    assumptions,
  ),
): ProjectionYear[] {
  const perProp = portfolio.properties
    .filter((p) => p.active !== false)
    .map((p) =>
      projectProperty(p, portfolio, assumptions, schedules.get(p.id) ?? []),
    );
  const baseYear = assumptions.baseDate.getUTCFullYear();
  const out: ProjectionYear[] = [];
  for (let t = 0; t <= assumptions.horizonYears; t++) {
    const acc = (sel: (y: ProjectionYear) => Decimal) =>
      perProp.reduce((s, yrs) => s.plus(sel(at(yrs, t))), ZERO);
    const value = acc((y) => y.value);
    const balance = acc((y) => y.balance);
    const noi = acc((y) => y.noi);
    const debtService = acc((y) => y.debtService);
    out.push({
      year: t,
      calendarYear: baseYear + t,
      ...yearPeriod(assumptions.baseDate, t),
      value,
      balance,
      equity: value.minus(balance),
      ltv: value.isZero() ? ZERO : balance.div(value),
      grossRent: acc((y) => y.grossRent),
      effectiveRent: acc((y) => y.effectiveRent),
      holdingCosts: acc((y) => y.holdingCosts),
      noi,
      interest: acc((y) => y.interest),
      principal: acc((y) => y.principal),
      debtService,
      netCashFlow: acc((y) => y.netCashFlow),
      draws: acc((y) => y.draws),
      prepaid: acc((y) => y.prepaid),
      prepaymentFees: acc((y) => y.prepaymentFees),
      dscr: debtService.isZero() ? null : noi.div(debtService),
      ratePa: null,
    });
  }
  return out;
}
