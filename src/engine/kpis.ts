// Portfolio KPIs incl. levered IRR (SPEC §4.6), computed from the portfolio
// projection. Every value is a pure function of (portfolio, assumptions).
import { ZERO, ONE, type Decimal } from "../lib/money";
import {
  DEBT_FREE_EPSILON,
  IRR_BRACKET_EXTENSIONS,
  IRR_BRACKET_HIGH,
  IRR_BRACKET_LOW,
  IRR_MAX_ITERATIONS,
  IRR_NPV_TOLERANCE,
  IRR_SCAN_GRID,
} from "./constants";
import { at } from "./arrays";
import {
  propertySchedules,
  scheduleRows,
  type PropertySchedule,
} from "./schedule";
import { assertInputs } from "./validate";
import { buildCpiIndex, projectPortfolio } from "./projections";
import {
  cashOutsideNetCf,
  prePurchaseDebtService,
  scheduleOf,
} from "./ownerCash";
import type {
  Assumptions,
  IrrNoRateReason,
  Portfolio,
  PortfolioKPIs,
  ProjectionYear,
} from "./types";

/** An IRR, or why there is none (DR-158). */
type IrrResult =
  { rate: Decimal; reason: null } | { rate: null; reason: IrrNoRateReason };

/** The IRR of `cashflows`, or null when there is none (see `irrResult`). */
export function irr(cashflows: Decimal[]): Decimal | null {
  return irrResult(cashflows).rate;
}

/**
 * IRR via bisection on the decimal NPV (DR-158, ADR 0079). NOT_UNIQUE when an NPV scan
 * over [−90 %, +1000 %] finds more than one root (counting cash-flow sign changes would
 * wrongly flag a vector with a future purchase). Otherwise the root is bracketed in
 * [−90 %, +100 %], then the upper bound widens in steps to +1000 %; a bracket end at the
 * root is the IRR (ADR 0121); NO_ROOT when no bracket holds one.
 */
export function irrResult(cashflows: Decimal[]): IrrResult {
  // Horner's rule in the discount factor v = 1/(1+rate): one multiply-add per cash flow
  // instead of a `pow` each (DR-041). Only the NPV's sign and the tolerance test are
  // read, so the result is the same bisection midpoint (irr-equivalence.test.ts).
  const npv = (rate: Decimal): Decimal => {
    const v = ONE.div(ONE.plus(rate));
    return cashflows.reduceRight((acc, cf) => acc.times(v).plus(cf), ZERO);
  };
  // Descartes' rule of signs: with at most one cash-flow sign change the NPV, a
  // polynomial in v > 0, has at most one root, so only scan when there are more.
  if (signChanges(cashflows) > 1 && npvRootsOnGrid(npv) > 1) {
    return { rate: null, reason: "NOT_UNIQUE" };
  }
  // All-zero flows: every rate is a root, so there is no IRR (DR-061).
  if (cashflows.every((cf) => cf.isZero())) {
    return { rate: null, reason: "NO_ROOT" };
  }
  // A bracket end whose NPV passes the tolerance test `bisect` applies is the root. The
  // sign of a product cannot tell: 0 × x is ±0 and Decimal(+0).isPositive() is true
  // (ADR 0121, #185).
  const nlo = npv(IRR_BRACKET_LOW);
  if (atRoot(nlo)) return { rate: IRR_BRACKET_LOW, reason: null };
  for (const hi of [IRR_BRACKET_HIGH, ...IRR_BRACKET_EXTENSIONS]) {
    const nhi = npv(hi);
    if (atRoot(nhi)) return { rate: hi, reason: null };
    if (nlo.times(nhi).isNegative()) {
      return { rate: bisect(npv, IRR_BRACKET_LOW, nlo, hi), reason: null };
    }
  }
  return { rate: null, reason: "NO_ROOT" };
}

/** An NPV close enough to 0 to be the root (the tolerance test of `bisect`). */
function atRoot(n: Decimal): boolean {
  return n.abs().lessThan(IRR_NPV_TOLERANCE);
}

/**
 * Roots of the NPV seen across `IRR_SCAN_GRID`: each sign change between neighbouring
 * points, and each run of points at a root (crossing or touching 0), counted once. A
 * root on a grid point is a root: with another one the IRR is not unique (#185).
 */
function npvRootsOnGrid(npv: (rate: Decimal) => Decimal): number {
  let roots = 0;
  let prev = 0;
  let inRoot = false;
  for (const n of IRR_SCAN_GRID.map(npv)) {
    if (atRoot(n)) {
      if (!inRoot) roots++;
      inRoot = true;
      continue;
    }
    const sign = n.isNegative() ? -1 : 1;
    if (!inRoot && prev !== 0 && sign !== prev) roots++;
    prev = sign;
    inRoot = false;
  }
  return roots;
}

/** Sign changes along `values`, skipping exact zeros. */
function signChanges(values: Decimal[]): number {
  let changes = 0;
  let prev = 0;
  for (const n of values) {
    if (n.isZero()) continue;
    const sign = n.isNegative() ? -1 : 1;
    if (prev !== 0 && sign !== prev) changes++;
    prev = sign;
  }
  return changes;
}

/** Bisect [lo, hi], whose NPVs are off the root and differ in sign, to the root. */
function bisect(
  npv: (rate: Decimal) => Decimal,
  lo: Decimal,
  nlo: Decimal,
  hi: Decimal,
): Decimal {
  for (let iter = 0; iter < IRR_MAX_ITERATIONS; iter++) {
    const mid = lo.plus(hi).div(2);
    const nmid = npv(mid);
    if (atRoot(nmid)) return mid;
    if (nlo.times(nmid).isNegative()) {
      hi = mid;
    } else {
      lo = mid;
      nlo = nmid;
    }
  }
  return lo.plus(hi).div(2);
}

/**
 * Net-worth growth. A multiple or a growth rate needs a *positive* opening equity base, so
 * both multiples and both CAGRs are null when equity0 ≤ 0 — no growth base, shown as "—"
 * (D-34, ADR 0126). A CAGR also needs a positive end: a negative base to the power 1/N is
 * NaN (ADR 0017), so it is null when the end net worth ≤ 0. `greaterThan`, because
 * `isPositive()` is also true for ZERO (DR-107). Real CAGR is taken off the CPI-deflated
 * net worth — identical to (1+cagr)/(1+infl)−1 under constant inflation, so parity holds.
 * The real multiple divides that same deflated net worth by equity0 (CPI₀ = 1, so equity0
 * is already in base-date Kč; ADR 0087).
 */
function equityGrowth(
  equity0: Decimal,
  equityN: Decimal,
  cpiN: Decimal,
  N: number,
) {
  const netWorthReal = equityN.div(cpiN);
  const hasBase = equity0.greaterThan(ZERO);
  const multiple = (end: Decimal) => (hasBase ? end.div(equity0) : null);
  const cagr = (end: Decimal) =>
    hasBase && end.greaterThan(ZERO)
      ? end.div(equity0).pow(ONE.div(N)).minus(ONE)
      : null;
  return {
    netWorthReal,
    netWorthMultiple: multiple(equityN),
    netWorthMultipleReal: multiple(netWorthReal),
    cagrNominal: cagr(equityN),
    cagrReal: cagr(netWorthReal),
  };
}

/**
 * Cumulative net cash flow (Σ `flows`, see `kpisFrom`), the first calendar year with a
 * positive net cash flow, and the year from which the portfolio stays debt-free (ADR
 * 0126). A debt-free year only counts once the portfolio has carried debt (a
 * never-leveraged portfolio reports null). NB: greaterThan(ZERO), not isPositive() —
 * ZERO.isPositive() is true, and a year with no active property nets exactly 0 (ADR 0121).
 * The real cumulative cash flow deflates each year by its own CPI_t (ADR 0087).
 */
function cashFlowMilestones(
  proj: ProjectionYear[],
  flows: Decimal[],
  cpi: Decimal[],
) {
  const firstCashFlowPositive =
    proj.slice(1).find((y) => y.netCashFlow.greaterThan(ZERO)) ?? null;
  const debtFree = firstDebtFreeYear(proj);
  return {
    cumulativeNetCashFlow: cumulativeNetCashFlow(flows),
    cumulativeNetCashFlowReal: cumulativeNetCashFlow(flows, cpi),
    firstCashFlowPositiveYear: firstCashFlowPositive?.calendarYear ?? null,
    firstCashFlowPositiveProjectionYear: firstCashFlowPositive?.year ?? null,
    debtFreeYear: debtFree?.calendarYear ?? null,
    debtFreeProjectionYear: debtFree?.year ?? null,
  };
}

/** Σ over years 1..N of `flows` (net cash flow minus the cash outside it); with `cpi`,
 *  each year's flow is divided by CPI_t first (real terms). */
function cumulativeNetCashFlow(flows: Decimal[], cpi?: Decimal[]): Decimal {
  let total = ZERO;
  for (let t = 1; t < flows.length; t++) {
    const flow = at(flows, t);
    total = total.plus(cpi ? flow.div(at(cpi, t)) : flow);
  }
  return total;
}

/** The first year (from year 1) from which the balance stays at or below
 *  DEBT_FREE_EPSILON through year N, once the portfolio has carried debt (in year 0 or
 *  any year up to and including that one); null if debt is owed at N or was never carried.
 *  Debt drawn again after a repaid year moves the year on (ADR 0126). */
function firstDebtFreeYear(proj: ProjectionYear[]): ProjectionYear | null {
  let from = proj.length;
  while (
    from > 1 &&
    at(proj, from - 1).balance.lessThanOrEqualTo(DEBT_FREE_EPSILON)
  )
    from--;
  if (from === proj.length) return null;
  const seenDebt = proj
    .slice(0, from + 1)
    .some((y) => y.balance.greaterThan(ZERO));
  return seenDebt ? at(proj, from) : null;
}

/** The levered IRR KPIs, each with the reason it has no value (DR-158). */
function leveredIrr(
  nominalVector: Decimal[],
  realVector: Decimal[],
): Pick<
  PortfolioKPIs,
  | "leveredIrrNominal"
  | "leveredIrrReal"
  | "leveredIrrNominalReason"
  | "leveredIrrRealReason"
> {
  const nominal = irrResult(nominalVector);
  const real = irrResult(realVector);
  return {
    leveredIrrNominal: nominal.rate,
    leveredIrrReal: real.rate,
    leveredIrrNominalReason: nominal.reason,
    leveredIrrRealReason: real.reason,
  };
}

/** Levered cash-flow vector [-equity0, flows_1..flows_{N-1}, flows_N + equityN], where
 *  `flows` is net cash flow minus the cash outside it (see `kpisFrom`; terminal sale at
 *  projected value). */
function leveredCashFlows(proj: ProjectionYear[], flows: Decimal[]): Decimal[] {
  const N = proj.length - 1;
  const vector: Decimal[] = [at(proj, 0).equity.negated()];
  for (let t = 1; t <= N; t++) {
    const cf = at(flows, t);
    vector.push(t === N ? cf.plus(at(proj, N).equity) : cf);
  }
  return vector;
}

/**
 * Σ principal repaid (scheduled and prepaid, ADR 0109) across active properties within
 * the horizon window. Schedules may
 * extend past it (a future loan amortizing over its own full term), but the parity
 * invariant is "Σ principal Yrs 1–N = initial debt", matching the projection. The raw
 * rows include the years before a future buy turns on, so this equals the projection's
 * principal + prepaid plus `prePurchaseDebtService`'s (ADR 0124).
 */
function principalRepaidInHorizon(
  portfolio: Portfolio,
  assumptions: Assumptions,
  schedules: Map<string, PropertySchedule>,
): Decimal {
  const horizonMonths = assumptions.horizonYears * 12;
  let total = ZERO;
  // Once per property id, in first-seen order (as a Map keyed by id would).
  const active = portfolio.properties.filter((p) => p.active !== false);
  for (const id of new Set(active.map((p) => p.id))) {
    for (const r of scheduleOf(schedules, id).rows) {
      if (r.month > horizonMonths) break;
      total = total.plus(r.principal).plus(r.prepaid);
    }
  }
  return total;
}

/** Σ interest of years 1..N, nominal and deflated by CPI_t (ADR 0103): the projection's
 *  plus the interest paid before a future buy turns on (ADR 0124). */
function interestInHorizon(
  proj: ProjectionYear[],
  prePurchase: { interest: Decimal }[],
  cpi: Decimal[],
  N: number,
): { totalInterest: Decimal; totalInterestReal: Decimal } {
  let nominal = ZERO;
  let real = ZERO;
  for (let t = 1; t <= N; t++) {
    const interest = at(proj, t).interest.plus(at(prePurchase, t).interest);
    nominal = nominal.plus(interest);
    real = real.plus(interest.div(at(cpi, t)));
  }
  return { totalInterest: nominal, totalInterestReal: real };
}

/** Portfolio KPIs (SPEC §4.6) from the portfolio projection. */
export function portfolioKpis(
  portfolio: Portfolio,
  assumptions: Assumptions,
): PortfolioKPIs {
  assertInputs(portfolio, assumptions); // D-37
  const schedules = propertySchedules(
    portfolio.mortgages,
    portfolio.properties.map((p) => p.id),
    assumptions,
  );
  // Validated above (DR-128).
  const proj = projectPortfolio(
    portfolio,
    assumptions,
    scheduleRows(schedules),
  );
  return kpisFrom(portfolio, assumptions, proj, schedules);
}

/**
 * `portfolioKpis` from a projection and the property schedules already built from the
 * same (validated) inputs, so they are not built again (DR-042).
 */
export function kpisFrom(
  portfolio: Portfolio,
  assumptions: Assumptions,
  proj: ProjectionYear[],
  schedules: Map<string, PropertySchedule>,
): PortfolioKPIs {
  const N = assumptions.horizonYears;
  // Time-varying CPI (honours a temporary inflation shock); cpi[N] is the horizon
  // deflator and cpi[t] deflates each cash flow. Collapses to (1+inflationPa)^t when
  // no shock is set, so the real-terms parity targets are unchanged.
  const cpi = buildCpiIndex(assumptions);
  const equity0 = at(proj, 0).equity;
  const equityN = at(proj, N).equity;
  const active = portfolio.properties.filter((p) => p.active !== false);
  const prePurchase = prePurchaseDebtService(active, assumptions, schedules);
  const outside = cashOutsideNetCf(
    active,
    portfolio,
    assumptions,
    schedules,
    proj,
  );
  // The owner's flow each year, built once: flows[t] = netCF_t − cashOutsideNetCf_t. The
  // nominal and real cumulative cash flow and both IRR vectors derive from it (#117);
  // index 0 is not read (year 0 is the opening equity).
  const flows = proj.map((y, t) => y.netCashFlow.minus(at(outside, t)));
  const nominalVector = leveredCashFlows(proj, flows);
  const realVector = nominalVector.map((cf, t) => cf.div(at(cpi, t)));

  return {
    netWorthNominal: equityN,
    ...equityGrowth(equity0, equityN, at(cpi, N), N),
    ...cashFlowMilestones(proj, flows, cpi),
    ...leveredIrr(nominalVector, realVector),
    totalPrincipalRepaid: principalRepaidInHorizon(
      portfolio,
      assumptions,
      schedules,
    ),
    ...interestInHorizon(proj, prePurchase, cpi, N),
  };
}
