// Independent reference model for the annual projection and the portfolio KPIs
// (ADR 0174, #160; TEST-ONLY).
//
// Written from SPEC.md §4.5–§4.6, NOT from the engine code. Like the mortgage reference it
// imports nothing from src/engine or src/lib (ESLint + dependency-cruiser enforce it): it
// uses the mortgage reference's own Decimal clone, ISO dates and loan schedule.
//
// It models a portfolio like the sample one and throws on anything else, so an input it
// does not model is never silently ignored. It checks its own inputs: owned at baseDate,
// one valuation in force at baseDate, non-overlapping leases, at most one plain loan drawn
// by baseDate whose prepayments and recasts all fall after baseDate. Inputs it has no
// field for (inactive properties, growth overrides, funding records, scenario shocks,
// acquisition costs) arrive as `unsupported` from the adapter, which must flag them.
//
// Formulas (SPEC.md):
//   • grid month m is dated addMonths(baseDate, m); year t covers months 12(t−1)+1 … 12t
//     (§4.5 "Projected rent"); calendarYear = baseYear + t (ADR 0022);
//   • value_t = V0·(1+g)^t for a valuation anchored at baseDate (§4.5, ADR 0032);
//   • rent: each grid month takes the lease in force on its grid date (latest start ≤ date,
//     end blank or ≥ date); the last lease keeps renting past its end unless it ended
//     before baseDate; monthly_t = rent·(1+idx)^(t−t₀), t₀ = 0 for the lease in force at
//     baseDate, else the year of its first grid month on/after its start;
//     effective_t = gross_t·(1−vacancy);
//   • holding_t = fixed0·CPI_t + mgmt·effective_t + maint·gross_t (ADR 0182), each cost
//     field falling back to the default when blank (§4.1),
//     fixed0 = tax + insurance + 12·SVJ + other;
//     CPI_t = (1+inflation)^t;
//   • NOI_t = effective_t − holding_t; debtService_t = interest_t + principal_t;
//     netCF_t = NOI_t − debtService_t; equity_t = value_t − balance_t;
//     cashToOwner_t = netCF_t − prepaid_t − fees_t (ADR 0109, 0161);
//   • KPIs as §4.6: net worth = equity_N, multiple and CAGR from equity₀ (null when
//     equity₀ ≤ 0, CAGR also when the end ≤ 0), levered IRR of
//     [−equity₀, cashToOwner_1, …, cashToOwner_N + equity_N − value_N·sellingCost],
//     real figures ÷ CPI_t; the selling cost touches only the IRR (ADR 0183).
import {
  Dec,
  addMonths,
  referenceBalanceAt,
  referenceSchedule,
  type Iso,
  type RefLoan,
  type RefRow,
} from "./mortgageReference";

type Value = string | number | Dec;
const d = (v: Value): Dec => new Dec(v);
const ZERO = d(0);
const ONE = d(1);

export interface RefCosts {
  propertyTaxYr?: Value;
  insuranceYr?: Value;
  mgmtPctRent?: Value;
  maintPctRent?: Value;
  svjMonthly?: Value;
  otherYr?: Value;
}

export interface RefAssumptions {
  baseDate: Iso;
  appreciationPa: Value;
  rentIndexationPa: Value;
  vacancyAllowance: Value;
  resetRatePa: Value;
  horizonYears: number;
  inflationPa: Value;
  /** 0–1 of the horizon value, off the IRR's terminal entry only; absent ⇒ 0. */
  sellingCostPct?: Value;
  defaults: Required<RefCosts>;
  /** Not modelled: set ⇒ the model throws. */
  unsupported?: string[];
}

export interface RefLease {
  start: Iso;
  end?: Iso;
  monthlyRent: Value;
}

export interface RefValuation {
  validFrom: Iso;
  validTo?: Iso;
  marketValue: Value;
}

export interface RefProperty {
  id: string;
  purchaseDate: Iso;
  valuations: RefValuation[];
  leases: RefLease[];
  costs: RefCosts;
  loans: RefLoan[];
  /** Not modelled: set ⇒ the model throws. */
  unsupported?: string[];
}

export interface RefYear {
  year: number;
  calendarYear: number;
  value: Dec;
  balance: Dec;
  equity: Dec;
  grossRent: Dec;
  effectiveRent: Dec;
  holdingCosts: Dec;
  noi: Dec;
  interest: Dec;
  principal: Dec;
  debtService: Dec;
  netCashFlow: Dec;
  prepaid: Dec;
  prepaymentFees: Dec;
  cashToOwner: Dec;
}

export interface RefKpis {
  netWorthNominal: Dec;
  netWorthReal: Dec;
  netWorthMultiple: Dec | null;
  netWorthMultipleReal: Dec | null;
  cagrNominal: Dec | null;
  cagrReal: Dec | null;
  cumulativeNetCashFlow: Dec;
  cumulativeNetCashFlowReal: Dec;
  firstCashFlowPositiveYear: number | null;
  firstCashFlowPositiveProjectionYear: number | null;
  debtFreeYear: number | null;
  debtFreeProjectionYear: number | null;
  leveredIrrNominal: Dec;
  leveredIrrReal: Dec;
  totalPrincipalRepaid: Dec;
  totalInterest: Dec;
  totalInterestReal: Dec;
}

const FLOWS = [
  "grossRent",
  "effectiveRent",
  "holdingCosts",
  "noi",
  "interest",
  "principal",
  "debtService",
  "netCashFlow",
  "prepaid",
  "prepaymentFees",
  "cashToOwner",
] as const;
const MONEY = ["value", "balance", "equity", ...FLOWS] as const;

function assertModelled(p: RefProperty, a: RefAssumptions): void {
  const no = (what: string): never => {
    throw new RangeError(`kpiReference does not model ${what} (${p.id}).`);
  };
  if (a.unsupported?.length) no(a.unsupported.join(", "));
  if (p.unsupported?.length) no(p.unsupported.join(", "));
  if (p.purchaseDate > a.baseDate) no("a purchase after baseDate");
  const [v, ...more] = p.valuations;
  if (!v || more.length > 0) return no("other than one valuation");
  if (v.validFrom > a.baseDate) no("a valuation after baseDate");
  if (v.validTo !== undefined) no("a valuation end date");
  const leases = [...p.leases].sort((x, y) => (x.start < y.start ? -1 : 1));
  leases.forEach((l, i) => {
    const next = leases[i + 1];
    if (next && (l.end === undefined || l.end >= next.start))
      no("overlapping leases");
  });
  if (p.loans.length > 1) no("more than one loan per property");
  for (const loan of p.loans) {
    if (loan.start > a.baseDate) no("a loan drawn after baseDate");
    if (loan.draws?.length || loan.completion || loan.termMonths)
      no("a development loan or an explicit term");
    const events = [...(loan.prepayments ?? []), ...(loan.recasts ?? [])];
    if (events.some((e) => e.date <= a.baseDate))
      no("a loan event on or before baseDate");
  }
}

/** The lease in force on `date`; the last lease is renewed unless it ended before
 *  `baseDate`. */
function leaseOn(
  leases: RefLease[],
  date: Iso,
  baseDate: Iso,
): RefLease | undefined {
  const sorted = [...leases].sort((x, y) => (x.start < y.start ? -1 : 1));
  const last = sorted[sorted.length - 1];
  const inForce = sorted.filter((l) => l.start <= date).pop();
  if (!inForce) return undefined;
  if (inForce.end === undefined || inForce.end >= date) return inForce;
  const renewed =
    inForce === last && inForce.end !== undefined && inForce.end >= baseDate;
  return renewed ? inForce : undefined;
}

/** Projection year of a lease's turn-on: 0 when in force at baseDate, else the year of
 *  its first grid month on/after its start. */
function turnOnYear(l: RefLease, a: RefAssumptions): number {
  if (l.start <= a.baseDate) return 0;
  let m = 1;
  while (addMonths(a.baseDate, m) < l.start) m++;
  return Math.ceil(m / 12);
}

const cpiAt = (a: RefAssumptions, t: number) => ONE.plus(a.inflationPa).pow(t);

const cost = (p: RefProperty, a: RefAssumptions, k: keyof RefCosts) =>
  d(p.costs[k] ?? a.defaults[k]);

function loanRows(loan: RefLoan, a: RefAssumptions): RefRow[] {
  return referenceSchedule(loan, {
    baseDate: a.baseDate,
    months: 12 * a.horizonYears,
    resetRatePa: a.resetRatePa,
    calendar: "gridDueDate",
  });
}

/** One property's projection, year 0 … horizon. */
export function referencePropertyProjection(
  p: RefProperty,
  a: RefAssumptions,
): RefYear[] {
  assertModelled(p, a);
  const baseYear = Number(a.baseDate.slice(0, 4));
  const v0 = d(p.valuations[0]!.marketValue);
  const rows = p.loans.flatMap((l) => loanRows(l, a));
  const opening = p.loans.reduce(
    (s, l) =>
      s.plus(referenceBalanceAt(l, { resetRatePa: a.resetRatePa }, a.baseDate)),
    ZERO,
  );
  const fixed0 = cost(p, a, "propertyTaxYr")
    .plus(cost(p, a, "insuranceYr"))
    .plus(cost(p, a, "svjMonthly").times(12))
    .plus(cost(p, a, "otherYr"));
  const mgmt = cost(p, a, "mgmtPctRent");
  const maint = cost(p, a, "maintPctRent");
  const years: RefYear[] = [];
  let balance = opening;
  for (let t = 0; t <= a.horizonYears; t++) {
    const value = v0.times(ONE.plus(a.appreciationPa).pow(t));
    const flow = Object.fromEntries(FLOWS.map((k) => [k, ZERO])) as Record<
      (typeof FLOWS)[number],
      Dec
    >;
    if (t > 0) {
      let gross = ZERO;
      for (let m = 12 * (t - 1) + 1; m <= 12 * t; m++) {
        const l = leaseOn(p.leases, addMonths(a.baseDate, m), a.baseDate);
        if (l)
          gross = gross.plus(
            d(l.monthlyRent).times(
              ONE.plus(a.rentIndexationPa).pow(t - turnOnYear(l, a)),
            ),
          );
      }
      const inYear = rows.filter(
        (r) => r.month > 12 * (t - 1) && r.month <= 12 * t,
      );
      const sum = (f: (r: RefRow) => Dec) =>
        inYear.reduce((s, r) => s.plus(f(r)), ZERO);
      flow.grossRent = gross;
      flow.effectiveRent = gross.times(ONE.minus(a.vacancyAllowance));
      flow.holdingCosts = fixed0
        .times(cpiAt(a, t))
        .plus(mgmt.times(flow.effectiveRent))
        .plus(maint.times(gross));
      flow.noi = flow.effectiveRent.minus(flow.holdingCosts);
      flow.interest = sum((r) => r.interest);
      flow.principal = sum((r) => r.principal);
      flow.debtService = flow.interest.plus(flow.principal);
      flow.netCashFlow = flow.noi.minus(flow.debtService);
      flow.prepaid = sum((r) => r.prepaid);
      flow.prepaymentFees = sum((r) => r.fee);
      flow.cashToOwner = flow.netCashFlow
        .minus(flow.prepaid)
        .minus(flow.prepaymentFees);
      // The schedule's balance after the year's last payment (exactly 0 once repaid).
      const end = rows.filter((r) => r.month <= 12 * t).pop();
      if (end) balance = end.endBalance;
    }
    years.push({
      year: t,
      calendarYear: baseYear + t,
      value,
      balance,
      equity: value.minus(balance),
      ...flow,
    });
  }
  return years;
}

/** The portfolio projection: Σ of the properties' rows. */
export function referenceProjection(
  props: RefProperty[],
  a: RefAssumptions,
): RefYear[] {
  const each = props.map((p) => referencePropertyProjection(p, a));
  const baseYear = Number(a.baseDate.slice(0, 4));
  return Array.from({ length: a.horizonYears + 1 }, (_, t) => {
    const row = { year: t, calendarYear: baseYear + t } as RefYear;
    for (const k of MONEY)
      row[k] = each.reduce((s, ys) => s.plus(ys[t]![k]), ZERO);
    return row;
  });
}

const npv = (flows: Dec[], r: Dec) =>
  flows.reduce((s, f, t) => s.plus(f.div(ONE.plus(r).pow(t))), ZERO);

const signChanges = (xs: Dec[]) => {
  const signs = xs.filter((x) => !x.isZero()).map((x) => x.isNegative());
  return signs.filter((s, i) => i > 0 && s !== signs[i - 1]).length;
};

/** IRR by bisection. The root must be unique: either the flows change sign exactly once
 *  (Descartes; bracket [−0.9, 10]), or they start negative and their running sums change
 *  sign exactly once (Norström; the one positive root, bracket [0, 10]) — as when a
 *  prepayment turns one year's cash negative between positive years. Throws otherwise,
 *  or when the bracket does not hold the root. */
export function referenceIrr(flows: Dec[]): Dec {
  const changes = signChanges(flows);
  let sum = ZERO;
  const running = flows.map((f) => (sum = sum.plus(f)));
  const norstrom =
    changes > 1 &&
    flows[0]!.isNegative() &&
    signChanges(running) === 1 &&
    !sum.isZero();
  if (changes !== 1 && !norstrom)
    throw new RangeError(
      `IRR needs a unique root (one sign change, or running sums changing sign once), got ${changes} sign changes.`,
    );
  let lo = d(norstrom ? 0 : "-0.9");
  let hi = d(10);
  const fLo = npv(flows, lo);
  if (fLo.isNegative() === npv(flows, hi).isNegative())
    throw new RangeError("No IRR in [−90 %, +1000 %].");
  for (let i = 0; i < 200; i++) {
    const mid = lo.plus(hi).div(2);
    if (npv(flows, mid).isNegative() === fLo.isNegative()) lo = mid;
    else hi = mid;
  }
  return lo.plus(hi).div(2);
}

export function referenceKpis(
  props: RefProperty[],
  a: RefAssumptions,
): RefKpis {
  const ys = referenceProjection(props, a);
  const n = a.horizonYears;
  const last = ys[n]!;
  const eq0 = ys[0]!.equity;
  const cpiN = cpiAt(a, n);
  const real = last.equity.div(cpiN);
  const later = ys.slice(1);
  const total = (f: (y: RefYear) => Dec) =>
    later.reduce((s, y) => s.plus(f(y)), ZERO);
  const growth = eq0.gt(0);
  const cagr = (end: Dec) =>
    growth && end.gt(0) ? end.div(eq0).pow(ONE.div(n)).minus(ONE) : null;
  const positive = later.find((y) => y.netCashFlow.gt(0));
  // The first year t ≥ 1 from which debt stays 0 through year N; none when the
  // portfolio never carried debt (ADR 0126 §3, not spelled out in SPEC §4.6).
  let free: RefYear | undefined;
  for (let t = n; t >= 1 && ys[t]!.balance.isZero(); t--) free = ys[t];
  if (ys.every((y) => y.balance.isZero())) free = undefined;
  const sellingCost = d(a.sellingCostPct ?? 0);
  const flows = ys.map((y, t) =>
    t === 0
      ? eq0.negated()
      : t === n
        ? y.cashToOwner.plus(y.equity).minus(y.value.times(sellingCost))
        : y.cashToOwner,
  );
  return {
    netWorthNominal: last.equity,
    netWorthReal: real,
    netWorthMultiple: growth ? last.equity.div(eq0) : null,
    netWorthMultipleReal: growth ? real.div(eq0) : null,
    cagrNominal: cagr(last.equity),
    cagrReal: cagr(real),
    cumulativeNetCashFlow: total((y) => y.cashToOwner),
    cumulativeNetCashFlowReal: total((y) =>
      y.cashToOwner.div(cpiAt(a, y.year)),
    ),
    firstCashFlowPositiveYear: positive?.calendarYear ?? null,
    firstCashFlowPositiveProjectionYear: positive?.year ?? null,
    debtFreeYear: free?.calendarYear ?? null,
    debtFreeProjectionYear: free?.year ?? null,
    leveredIrrNominal: referenceIrr(flows),
    leveredIrrReal: referenceIrr(flows.map((f, t) => f.div(cpiAt(a, t)))),
    totalPrincipalRepaid: total((y) => y.principal.plus(y.prepaid)),
    totalInterest: total((y) => y.interest),
    totalInterestReal: total((y) => y.interest.div(cpiAt(a, y.year))),
  };
}
