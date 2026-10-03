// Monthly amortization schedules with the Czech fixation reset (SPEC §4.4).
//
// One month-step kernel (`amortizeMonth`) drives all three loops: the plain-loan grid,
// the development-loan grid, and the development-loan catch-up from startDate to
// baseDate. The loops differ only where the behaviour differs, and each difference
// is named below rather than silently unified:
//   • payoff guard — both grids emit zero rows once the balance is repaid (DR-044);
//   • re-amortization trigger — plain: a rate change only; development: a tranche
//     landing, the end of interest-only, or a rate change (D-24). Between events the
//     instalment holds; a development loan opens with the annuity of its principal
//     over the required term (D-31, `scheduledInstalment`);
//   • instalment during interest-only — the catch-up adopts the interest as the
//     instalment in force; the grid keeps the pre-interest-only instalment.
//
// Calendar (D-21, J-03 a′): rows sit on the baseDate grid EDATE(baseDate, m), but each
// row carries payment number p = paymentsDueAtBase + m (running loan) or m − drawMonth
// (future loan), and its rate is read on that payment's due date EDATE(start, p). So
// the payment due on the fixation end is still at the fixed rate (DR-101), and a
// clamped month-end due date counts as paid (DR-070). Interest-only and tranche
// landing stay on the grid.
import { PMT, ZERO, type Decimal } from "../lib/money";
import {
  edate,
  firstAfter,
  firstGridMonthOnOrAfter,
  isAfter,
  isOnOrBefore,
  lastGridMonthOnOrBefore,
} from "./dates";
import {
  currentBalance,
  drawMonth,
  eventTermMonths,
  instalmentFor,
  isDevLoan,
  maxTermMonths,
  mortgageBlock,
  nperMonths,
  paymentsDueBy,
  rateAt,
  scheduledInstalment,
  scheduleMonths,
  selectBlock,
  termMonths,
} from "./amortization";
import { at } from "./arrays";
import {
  assertAssumptions,
  assertBlockStarts,
  assertLoanInputs,
  assertLoanRows,
} from "./validate";
import type {
  AmortizationRow,
  Assumptions,
  DevelopmentLoan,
  IsoDate,
  LoanEventIssue,
  LoanEventOutcome,
  LoanRecast,
  MortgageBlock,
  MortgageDraw,
  MortgagePrepayment,
  PlainLoan,
  PrepaymentEffect,
  Refinance,
} from "./types";

// ---------------------------------------------------------------------------
// The month-step kernel
// ---------------------------------------------------------------------------

/**
 * Split one annuity payment into interest and principal at a given balance & monthly
 * rate. Interest accrues only on a positive balance; principal is the remainder,
 * clamped to [0, balance] so it never goes negative (instalment under interest) nor
 * overshoots the outstanding balance (final payment).
 */
function splitPayment(
  instalment: Decimal,
  balance: Decimal,
  rateMonthly: Decimal,
): { interest: Decimal; principal: Decimal } {
  const interest = balance.isPositive() ? balance.times(rateMonthly) : ZERO;
  let principal = instalment.minus(interest);
  if (principal.isNegative()) principal = ZERO;
  if (principal.greaterThan(balance)) principal = balance;
  return { interest, principal };
}

/**
 * Instalment that amortizes `balance` over `remainingTerm` months at `rateMonthly`,
 * or a one-shot payoff (balance + this month's interest) when the term has run out.
 */
function recomputeInstalment(
  rateMonthly: Decimal,
  remainingTerm: number,
  balance: Decimal,
): Decimal {
  return remainingTerm > 0
    ? PMT(rateMonthly, remainingTerm, balance.negated())
    : balance.plus(balance.times(rateMonthly));
}

/** What one month of the amortization core pays and leaves outstanding. */
interface MonthStep {
  instalment: Decimal;
  interest: Decimal;
  principal: Decimal;
  endBalance: Decimal;
}

/**
 * One month of the amortization core on `balanceIn` (any tranche already added):
 * interest-only months pay interest and no principal; otherwise the instalment in
 * force — re-amortized over `reamortizeOver` months when that is not null — is split
 * into interest and principal. The payment at maturity (`atMaturity`: payment
 * number ≥ term) pays the whole balance, so no residual outlives the loan (D-40).
 */
function amortizeMonth(
  balanceIn: Decimal,
  ratePa: Decimal,
  interestOnly: boolean,
  instalment: Decimal,
  reamortizeOver: number | null,
  atMaturity: boolean,
): MonthStep {
  const rateMonthly = ratePa.div(12);
  if (interestOnly) {
    const interest = balanceIn.isPositive()
      ? balanceIn.times(rateMonthly)
      : ZERO;
    return {
      instalment: interest,
      interest,
      principal: ZERO,
      endBalance: balanceIn,
    };
  }
  const paid =
    reamortizeOver === null
      ? instalment
      : recomputeInstalment(rateMonthly, reamortizeOver, balanceIn);
  const split = splitPayment(paid, balanceIn, rateMonthly);
  const interest = split.interest;
  const principal = atMaturity ? balanceIn : split.principal;
  return {
    instalment: paid,
    interest,
    principal,
    endBalance: balanceIn.minus(principal),
  };
}

/**
 * Payment number carried by grid month 0 (D-21): the payments due by baseDate for a
 * running loan, or −drawMonth for a future loan (drawn in grid month drawMonth, first
 * payment the month after). Grid month m then carries payment `offset + m`.
 */
export function paymentOffset(block: MortgageBlock, baseDate: Date): number {
  return isAfter(block.startDate, baseDate)
    ? -drawMonth(block, baseDate)
    : lastGridMonthOnOrBefore(block.startDate, baseDate);
}

/** Due date of the last payment due by baseDate (the start when none is due yet). */
function lastPaymentDue(block: MortgageBlock, baseDate: Date): Date {
  return edate(
    block.startDate,
    lastGridMonthOnOrBefore(block.startDate, baseDate),
  );
}

/** The rate of payment `p`, read on its due date EDATE(start, p) (D-21). */
function rateOfPayment(
  p: number,
  block: MortgageBlock,
  assumptions: Assumptions,
): Decimal {
  return rateAt(edate(block.startDate, p), block, assumptions);
}

/** Re-amortization trigger: a tranche landing, the end of interest-only, or a rate
 *  change (D-24). Between events the instalment holds. A plain loan has no tranches
 *  and no interest-only months, so for it this is a rate change only. (`greaterThan`,
 *  because `Decimal(0).isPositive()` is true — DR-102.) */
function reamortizes(
  draw: Decimal,
  prevInterestOnly: boolean,
  interestOnly: boolean,
  ratePa: Decimal,
  prevRate: Decimal,
): boolean {
  return (
    draw.greaterThan(ZERO) ||
    (prevInterestOnly && !interestOnly) ||
    !ratePa.equals(prevRate)
  );
}

/** True while a development loan is interest-only (up to and including completion). */
function interestOnlyAt(block: MortgageBlock, date: Date): boolean {
  return (
    block.completionDate != null && isOnOrBefore(date, block.completionDate)
  );
}

/** A no-payment row (undrawn future loan, or a fully repaid loan past payoff). */
function zeroRow(
  month: number,
  date: IsoDate,
  ratePa: Decimal,
  endBalance: Decimal = ZERO,
): AmortizationRow {
  return {
    month,
    date,
    ratePa,
    instalment: ZERO,
    interest: ZERO,
    principal: ZERO,
    drawn: ZERO,
    prepaid: ZERO,
    prepaymentFee: ZERO,
    endBalance,
  };
}

/**
 * Row for a future loan before it is drawn: a zero row until the grid date reaches
 * startDate, then the draw row (balance = initialPrincipal drawn, no payment yet — the
 * baseDate-month-0 analog). `drawsNow` tells the caller the loan is now drawn.
 */
function undrawnRow(
  block: MortgageBlock,
  m: number,
  date: IsoDate,
): { row: AmortizationRow; drawsNow: boolean } {
  if (isAfter(block.startDate, date)) {
    return { row: zeroRow(m, date, block.interestRatePa), drawsNow: false };
  }
  return {
    row: {
      ...zeroRow(m, date, block.interestRatePa, block.initialPrincipal),
      drawn: block.initialPrincipal,
    },
    drawsNow: true,
  };
}

// ---------------------------------------------------------------------------
// Tranche bucketing
// ---------------------------------------------------------------------------

/** First step k in [1,maxStep] whose cadence date (anchor + k months) is on/after
 *  `date`, capped at maxStep. Validation rejects a draw on/after the loan's final
 *  payment date (DR-074), so a valid draw never reaches the cap. */
function firstStepOnOrAfter(anchor: Date, date: Date, maxStep: number): number {
  const cap = Math.max(1, maxStep);
  return Math.min(firstGridMonthOnOrAfter(anchor, date, cap - 1), cap);
}

/** Group dated items by the cadence step (anchor + k months) they land in, in input
 *  order, over the items the `include` predicate accepts. */
function bucketByStep<T extends { date: IsoDate }>(
  items: readonly T[],
  anchor: Date,
  maxStep: number,
  include: (d: Date) => boolean,
): Map<number, T[]> {
  const buckets = new Map<number, T[]>();
  for (const item of items) {
    if (!include(item.date)) continue;
    const k = firstStepOnOrAfter(anchor, item.date, maxStep);
    buckets.set(k, [...(buckets.get(k) ?? []), item]);
  }
  return buckets;
}

/** Bucket draw amounts by the cadence step (anchor + k months) they land in,
 *  summing collisions, over the draws the `include` predicate accepts. */
function bucketDraws(
  draws: MortgageDraw[],
  anchor: Date,
  maxStep: number,
  include: (d: Date) => boolean,
): Map<number, Decimal> {
  const sums = new Map<number, Decimal>();
  for (const [k, items] of bucketByStep(draws, anchor, maxStep, include)) {
    sums.set(
      k,
      items.reduce((sum, d) => sum.plus(d.amount), ZERO),
    );
  }
  return sums;
}

// ---------------------------------------------------------------------------
// Prepayments and recasts (ADR 0109)
// ---------------------------------------------------------------------------

/**
 * The loan's last payment number in force — the contract term until a prepayment
 * shortens it or a recast moves it — and what the next payment owes: a
 * re-amortization over the payments left, or an agreed instalment (ADR 0109).
 */
interface TermState {
  term: number;
  reamortizeNext: boolean;
  agreedInstalment: Decimal | null;
}

function initialTerms(block: MortgageBlock): TermState {
  return {
    term: termMonths(block),
    reamortizeNext: false,
    agreedInstalment: null,
  };
}

/** After an amortizing payment nothing is owed to the next one any more. Through
 *  interest-only months it stays owed (completion re-amortizes anyway). */
function paidTerms(terms: TermState, interestOnly: boolean): TermState {
  return interestOnly
    ? terms
    : { ...terms, reamortizeNext: false, agreedInstalment: null };
}

/**
 * How payment `p` is paid: the agreed instalment, else the instalment in force,
 * re-amortized over the payments left to the maturity in force (constant maturity)
 * when `trigger` fires or a prepayment owes it; the payment at that maturity clears
 * the balance (D-40).
 */
function paymentTerms(
  terms: TermState,
  trigger: boolean,
  p: number,
  instalment: Decimal,
): { instalment: Decimal; reamortizeOver: number | null; atMaturity: boolean } {
  const agreed = terms.agreedInstalment;
  return {
    instalment: agreed ?? instalment,
    reamortizeOver:
      agreed === null && (trigger || terms.reamortizeNext)
        ? terms.term - (p - 1)
        : null,
    atMaturity: p >= terms.term,
  };
}

/** A tranche landing on or after the maturity in force goes back to the contract term
 *  (ADR 0109, ADR 0116), so it is not paid off in one shot. */
function termsForTranche(
  terms: TermState,
  draw: Decimal,
  p: number,
  contractTerm: number,
): TermState {
  return draw.greaterThan(ZERO) && p >= terms.term
    ? { ...terms, term: Math.max(terms.term, contractTerm) }
    : terms;
}

/** A block's prepayments and recasts, keyed by the payment number they follow. */
interface LoanEvents {
  block: MortgageBlock;
  assumptions: Assumptions;
  contractTerm: number;
  prepaymentsAt: Map<number, MortgagePrepayment[]>;
  recastsAt: Map<number, LoanRecast[]>;
}

/** The events `include` accepts (by date), each after the first payment due on or
 *  after its date — on the loan's own cadence, so moving baseDate never moves it. */
function loanEvents(
  block: MortgageBlock,
  assumptions: Assumptions,
  include: (d: Date) => boolean,
): LoanEvents {
  const start = block.startDate;
  return {
    block,
    assumptions,
    contractTerm: termMonths(block),
    prepaymentsAt: bucketByStep(
      byDate(block.prepayments),
      start,
      Infinity,
      include,
    ),
    recastsAt: bucketByStep(byDate(block.recasts), start, Infinity, include),
  };
}

/** Events in date order (stable), so one period applies them as dated. */
function byDate<T extends { date: Date }>(items: T[] | undefined): T[] {
  return [...(items ?? [])].sort((a, b) => a.date.getTime() - b.date.getTime());
}

interface PeriodEvents {
  prepayments: MortgagePrepayment[];
  recasts: LoanRecast[];
}

function eventsAt(ev: LoanEvents, k: number): PeriodEvents {
  return {
    prepayments: ev.prepaymentsAt.get(k) ?? [],
    recasts: ev.recastsAt.get(k) ?? [],
  };
}

/** The state right after payment `p` (grid month `month`), before its events. */
interface PaymentDone {
  p: number;
  month: number;
  balance: Decimal;
  ratePa: Decimal;
  instalment: Decimal;
  interestOnly: boolean;
  terms: TermState;
}

/** An event outcome plus, for a prepayment, the fee entered with it: a handover that
 *  pays the prepayment charges that fee (ADR 0116). Internal; stripped on output. */
type Outcome = LoanEventOutcome & { enteredFee?: Decimal };

interface Settled {
  balance: Decimal;
  prepaid: Decimal;
  fee: Decimal;
  terms: TermState;
  outcomes: Outcome[];
}

function prepaymentIssue(
  requested: Decimal,
  applied: Decimal,
): LoanEventIssue | null {
  if (!applied.greaterThan(ZERO)) return "PREPAYMENT_AFTER_PAYOFF";
  return applied.lessThan(requested) ? "PREPAYMENT_EXCEEDS_BALANCE" : null;
}

/** Pay the period's prepayments in date order, each clamped to the balance left. */
function applyPrepayments(
  ev: LoanEvents,
  done: PaymentDone,
  prepayments: MortgagePrepayment[],
): Omit<Settled, "terms"> & { effect: PrepaymentEffect | null } {
  let { balance } = done;
  let [prepaid, fee] = [ZERO, ZERO];
  let effect: PrepaymentEffect | null = null;
  const outcomes: Outcome[] = [];
  for (const p of prepayments) {
    const applied = p.amount.lessThan(balance) ? p.amount : balance;
    const charged = applied.greaterThan(ZERO) ? (p.fee ?? ZERO) : ZERO;
    if (applied.greaterThan(ZERO)) {
      [balance, prepaid, fee] = [
        balance.minus(applied),
        prepaid.plus(applied),
        fee.plus(charged),
      ];
      effect = p.effect;
    }
    outcomes.push({
      blockId: ev.block.id,
      kind: "prepayment",
      date: p.date,
      month: done.month,
      requested: p.amount,
      applied,
      fee: charged,
      issue: prepaymentIssue(p.amount, applied),
      enteredFee: p.fee ?? ZERO,
    });
  }
  return { balance, prepaid, fee, effect, outcomes };
}

/**
 * The bank's answer to the period's prepayments, once, on the balance after all of
 * them (the last one's effect): lower the instalment from the next payment, or keep
 * it and end the loan after `ceil(NPER)` more payments at this payment's rate.
 * Interest-only months pay no instalment to keep: completion re-amortizes anyway.
 */
function prepaymentTerms(
  effect: PrepaymentEffect | null,
  done: PaymentDone,
): TermState {
  const { terms, balance } = done;
  if (!effect || done.interestOnly || !balance.greaterThan(ZERO)) return terms;
  if (effect === "lowerInstalment") return { ...terms, reamortizeNext: true };
  const left = nperMonths(done.ratePa.div(12), done.instalment, balance);
  return Number.isFinite(left) && left > 0
    ? { ...terms, term: Math.min(terms.term, done.p + left) }
    : terms;
}

/**
 * A recast's new terms: to a maturity, re-amortize from the next payment; to an
 * instalment, the next payment pays it (at its own rate) and the maturity follows
 * from NPER — capped at loan start + 50 years, where it re-amortizes instead.
 */
function recastTerms(
  ev: LoanEvents,
  done: PaymentDone,
  r: LoanRecast,
): { terms: TermState; issue: LoanEventIssue | null } {
  if (r.maturity !== undefined) {
    const term = paymentsDueBy(ev.block, r.maturity);
    return {
      terms: { term, reamortizeNext: true, agreedInstalment: null },
      issue: null,
    };
  }
  const next = rateOfPayment(done.p + 1, ev.block, ev.assumptions).div(12);
  if (r.instalment.lessThanOrEqualTo(done.balance.times(next))) {
    return { terms: done.terms, issue: "RECAST_INSTALMENT_BELOW_INTEREST" };
  }
  const last = done.p + nperMonths(next, r.instalment, done.balance);
  const cap = maxTermMonths(ev.contractTerm);
  return last > cap
    ? {
        terms: { term: cap, reamortizeNext: true, agreedInstalment: null },
        issue: "RECAST_TERM_CAPPED",
      }
    : {
        terms: {
          term: last,
          reamortizeNext: false,
          agreedInstalment: r.instalment,
        },
        issue: null,
      };
}

function applyRecasts(
  ev: LoanEvents,
  done: PaymentDone,
  recasts: LoanRecast[],
): { terms: TermState; outcomes: Outcome[] } {
  let { terms } = done;
  const outcomes: Outcome[] = [];
  for (const r of recasts) {
    const result = done.balance.greaterThan(ZERO)
      ? recastTerms(ev, { ...done, terms }, r)
      : { terms, issue: "RECAST_AFTER_PAYOFF" as const };
    terms = result.terms;
    outcomes.push({
      blockId: ev.block.id,
      kind: "recast",
      date: r.date,
      month: done.month,
      requested: ZERO,
      applied: ZERO,
      fee: ZERO,
      issue: result.issue,
    });
  }
  return { terms, outcomes };
}

/** After payment `p`: its prepayments, the bank's answer to them, then its recasts
 *  (ADR 0109). */
function settleEvents(
  ev: LoanEvents,
  done: PaymentDone,
  period: PeriodEvents,
): Settled {
  if (period.prepayments.length === 0 && period.recasts.length === 0) {
    return { ...done, prepaid: ZERO, fee: ZERO, outcomes: [] };
  }
  const paid = applyPrepayments(ev, done, period.prepayments);
  const after = { ...done, balance: paid.balance };
  const terms = prepaymentTerms(paid.effect, after);
  const recast = applyRecasts(ev, { ...after, terms }, period.recasts);
  return {
    balance: paid.balance,
    prepaid: paid.prepaid,
    fee: paid.fee,
    terms: recast.terms,
    outcomes: [...paid.outcomes, ...recast.outcomes],
  };
}

/** A paid month's row: the payment, then the prepayments it was followed by. */
function paymentRow(
  head: Pick<AmortizationRow, "month" | "date" | "ratePa" | "drawn">,
  step: MonthStep,
  settled: Settled,
): AmortizationRow {
  return {
    ...head,
    ...step,
    prepaid: settled.prepaid,
    prepaymentFee: settled.fee,
    endBalance: settled.balance,
  };
}

/** True when an event is dated on/before baseDate: the opening balance replays it. */
function hasPastEvents(block: MortgageBlock, baseDate: Date): boolean {
  return [...(block.prepayments ?? []), ...(block.recasts ?? [])].some((e) =>
    isOnOrBefore(e.date, baseDate),
  );
}

// ---------------------------------------------------------------------------
// Catch-up from startDate to baseDate
// ---------------------------------------------------------------------------

/** The loan at baseDate (or along the way there), and what its events did. */
interface Opening {
  balance: Decimal;
  currentInstalment: Decimal;
  terms: TermState;
  outcomes: Outcome[];
}

interface CatchUpState extends Opening {
  prevRate: Decimal;
  prevInterestOnly: boolean;
}

interface CatchUpContext {
  events: LoanEvents;
  drawsByStep: Map<number, Decimal>;
  steps: number;
}

/** One payment of the catch-up, on the loan's own cadence, then its events. */
function catchUpStep(
  s: CatchUpState,
  k: number,
  ctx: CatchUpContext,
): CatchUpState {
  const { block, assumptions, contractTerm } = ctx.events;
  const date = edate(block.startDate, k);
  const draw = ctx.drawsByStep.get(k) ?? ZERO;
  const ratePa = rateAt(date, block, assumptions);
  const io = interestOnlyAt(block, date);
  const terms = termsForTranche(s.terms, draw, k, contractTerm);
  const trigger = reamortizes(draw, s.prevInterestOnly, io, ratePa, s.prevRate);
  const pay = paymentTerms(terms, trigger, k, s.currentInstalment);
  const step = amortizeMonth(
    s.balance.plus(draw),
    ratePa,
    io,
    pay.instalment,
    pay.reamortizeOver,
    pay.atMaturity,
  );
  const settled = settleEvents(
    ctx.events,
    {
      p: k,
      month: k - ctx.steps,
      balance: step.endBalance,
      ratePa,
      instalment: step.instalment,
      interestOnly: io,
      terms: paidTerms(terms, io),
    },
    eventsAt(ctx.events, k),
  );
  return {
    balance: settled.balance,
    currentInstalment: step.instalment,
    terms: settled.terms,
    outcomes: [...s.outcomes, ...settled.outcomes],
    prevRate: ratePa,
    prevInterestOnly: io,
  };
}

/**
 * Opening state of a loan already running at baseDate. The closed-form
 * `currentBalance` (a single FV at the original rate) can't see tranches,
 * interest-only months, a fixation that already ended or a prepayment, so we
 * simulate month-by-month on the loan's OWN cadence (`edate(startDate, k)`) for the
 * payments due by baseDate — counted like `currentBalance` (D-21). Development loans
 * always take this path; plain loans once their fixation has ended (D-30) or when an
 * event is dated on/before baseDate (ADR 0109). Returns the balance, the instalment
 * and the maturity in force at baseDate, which the baseDate-anchored schedule opens
 * from.
 */
function simulateToBaseDate(
  block: MortgageBlock,
  assumptions: Assumptions,
): Opening {
  const { baseDate } = assumptions;
  const steps = lastGridMonthOnOrBefore(block.startDate, baseDate);
  const ctx: CatchUpContext = {
    events: loanEvents(block, assumptions, (d) => isOnOrBefore(d, baseDate)),
    // Only tranches up to the last payment due: a later one (still on/before
    // baseDate) belongs to the next payment period, grid month 1 (D-41, DR-016).
    drawsByStep: bucketDraws(
      block.draws ?? [],
      block.startDate,
      Math.max(1, steps),
      (d) => isOnOrBefore(d, lastPaymentDue(block, baseDate)),
    ),
    steps,
  };
  let s: CatchUpState = {
    balance: block.initialPrincipal,
    currentInstalment: scheduledInstalment(block),
    terms: initialTerms(block),
    outcomes: [],
    prevRate: rateAt(block.startDate, block, assumptions),
    prevInterestOnly: interestOnlyAt(block, block.startDate),
  };
  for (let k = 1; k <= steps; k++) s = catchUpStep(s, k, ctx);
  // Events after the last payment due and on/before baseDate are history too: they
  // follow that payment (or the start, when none is due yet).
  const late = settleEvents(
    ctx.events,
    {
      p: steps,
      month: 0,
      balance: s.balance,
      ratePa: s.prevRate,
      instalment: s.currentInstalment,
      interestOnly: s.prevInterestOnly,
      terms: s.terms,
    },
    eventsAt(ctx.events, steps + 1),
  );
  return {
    balance: late.balance,
    currentInstalment: s.currentInstalment,
    terms: late.terms,
    outcomes: [...s.outcomes, ...late.outcomes],
  };
}

/** Running per-month state of the development-loan grid. */
interface DevScheduleState {
  balance: Decimal;
  currentInstalment: Decimal;
  drawn: boolean;
  prevRate: Decimal;
  prevInterestOnly: boolean;
  terms: TermState;
}

function initDevScheduleState(
  block: DevelopmentLoan,
  assumptions: Assumptions,
): { state: DevScheduleState; outcomes: Outcome[] } {
  const { baseDate } = assumptions;
  if (isAfter(block.startDate, baseDate)) {
    return {
      state: {
        balance: ZERO,
        currentInstalment: scheduledInstalment(block),
        drawn: false,
        prevRate: block.interestRatePa,
        prevInterestOnly: false,
        terms: initialTerms(block),
      },
      outcomes: [],
    };
  }
  const sim = simulateToBaseDate(block, assumptions);
  return {
    state: {
      balance: sim.balance,
      currentInstalment: sim.currentInstalment,
      drawn: true,
      prevRate: rateOfPayment(
        paymentOffset(block, baseDate),
        block,
        assumptions,
      ),
      // The last payment made, not baseDate: a completion between the two must still
      // trigger the re-amortization at grid month 1 (D-24, ADR 0116).
      prevInterestOnly: interestOnlyAt(
        block,
        edate(block.startDate, paymentOffset(block, baseDate)),
      ),
      terms: sim.terms,
    },
    outcomes: sim.outcomes,
  };
}

/** Everything the development-loan grid needs besides the running state. */
interface DevScheduleContext {
  block: DevelopmentLoan;
  assumptions: Assumptions;
  startToBase: number;
  drawsByMonth: Map<number, Decimal>;
  /** The tranches dated after baseDate, by grid month: the new debt a row draws
   *  (DR-092). A tranche on/before baseDate that lands in grid month 1 is opening
   *  debt (D-41, D-44). */
  newDebtByMonth: Map<number, Decimal>;
  /** Prepayments and recasts dated after baseDate (ADR 0109). */
  events: LoanEvents;
}

type DevMonthStep = {
  row: AmortizationRow;
  state: DevScheduleState;
  outcomes: Outcome[];
};

/** A month before the first draw: nothing owed, or the first draw landing (it carries
 *  no payment; the instalment is sized on the drawn amount over the full term). */
function undrawnMonthStep(
  state: DevScheduleState,
  m: number,
  date: IsoDate,
  ctx: DevScheduleContext,
): DevMonthStep {
  const { block, assumptions } = ctx;
  const { row, drawsNow } = undrawnRow(block, m, date);
  if (!drawsNow) return { row, state, outcomes: [] };
  const tranche = ctx.drawsByMonth.get(m) ?? ZERO;
  const balance = row.endBalance.plus(tranche);
  return {
    row: { ...row, drawn: balance, endBalance: balance },
    state: {
      ...state,
      balance,
      currentInstalment: tranche.greaterThan(ZERO)
        ? instalmentFor(balance, block.interestRatePa, block.loanTermYears)
        : state.currentInstalment,
      drawn: true,
      prevRate: rateOfPayment(ctx.startToBase + m, block, assumptions),
      prevInterestOnly: interestOnlyAt(block, date),
    },
    outcomes: [],
  };
}

/** One grid month of a drawn development loan: what payment `p` meets. */
interface DevMonth {
  m: number;
  p: number;
  date: IsoDate;
  draw: Decimal;
  ratePa: Decimal;
  io: boolean;
}

/** A drawn development loan's payment `p`, then its prepayments and recasts. */
function devPaymentStep(
  state: DevScheduleState,
  mo: DevMonth,
  ctx: DevScheduleContext,
): DevMonthStep {
  const { m, p, date, draw, ratePa, io } = mo;
  const terms = termsForTranche(state.terms, draw, p, ctx.events.contractTerm);
  const trigger = reamortizes(
    draw,
    state.prevInterestOnly,
    io,
    ratePa,
    state.prevRate,
  );
  const pay = paymentTerms(terms, trigger, p, state.currentInstalment);
  const step = amortizeMonth(
    state.balance.plus(draw),
    ratePa,
    io,
    pay.instalment,
    pay.reamortizeOver,
    pay.atMaturity,
  );
  const settled = settleEvents(
    ctx.events,
    {
      p,
      month: m,
      balance: step.endBalance,
      ratePa,
      instalment: step.instalment,
      interestOnly: io,
      terms: paidTerms(terms, io),
    },
    eventsAt(ctx.events, p),
  );
  const drawn = ctx.newDebtByMonth.get(m) ?? ZERO;
  return {
    row: paymentRow({ month: m, date, ratePa, drawn }, step, settled),
    state: {
      balance: settled.balance,
      currentInstalment: io ? state.currentInstalment : step.instalment,
      drawn: true,
      prevRate: ratePa,
      prevInterestOnly: io,
      terms: settled.terms,
    },
    outcomes: settled.outcomes,
  };
}

/** One month of the development-loan grid: undrawn → first draw → IO → amortizing.
 *  A later tranche landing this month grows the balance before this month's split
 *  (unlike the first draw, which carries no payment). A tranche landing in the first
 *  draw's month joins that draw, and the instalment is sized on the combined amount
 *  over the full term (D-46, DR-122). */
function devMonthStep(
  state: DevScheduleState,
  m: number,
  ctx: DevScheduleContext,
): DevMonthStep {
  const { block, assumptions } = ctx;
  const date = edate(assumptions.baseDate, m);
  if (!state.drawn) return undrawnMonthStep(state, m, date, ctx);
  const p = ctx.startToBase + m;
  const draw = ctx.drawsByMonth.get(m) ?? ZERO;
  const ratePa = rateOfPayment(p, block, assumptions);
  const io = interestOnlyAt(block, date);
  // Payoff guard, as in the plain grid: once repaid (and no tranche lands) nothing
  // is due, rather than the held instalment on a zero balance (DR-044).
  if (!state.balance.plus(draw).greaterThan(ZERO)) {
    return {
      row: zeroRow(m, date, ratePa),
      state: { ...state, prevRate: ratePa, prevInterestOnly: io },
      outcomes: repaidOutcomes(ctx.events, p, m, state),
    };
  }
  return devPaymentStep(state, { m, p, date, draw, ratePa, io }, ctx);
}

/** Events meeting a repaid loan: nothing to prepay, no maturity to change. */
function repaidOutcomes(
  ev: LoanEvents,
  p: number,
  m: number,
  state: { currentInstalment: Decimal; prevRate: Decimal; terms: TermState },
): Outcome[] {
  return settleEvents(
    ev,
    {
      p,
      month: m,
      balance: ZERO,
      ratePa: state.prevRate,
      instalment: state.currentInstalment,
      interestOnly: false,
      terms: state.terms,
    },
    eventsAt(ev, p),
  ).outcomes;
}

/** A block's rows and what its prepayments and recasts did (ADR 0109). */
interface BlockSchedule {
  rows: AmortizationRow[];
  outcomes: Outcome[];
}

/**
 * Rows to build: the contract schedule (`scheduleMonths`), or longer when a recast
 * can run the loan past it (ADR 0109). Grid month m carries payment `offset + m`.
 */
function builtMonths(
  block: MortgageBlock,
  assumptions: Assumptions,
  offset: number,
): number {
  const contract = scheduleMonths(block, assumptions);
  if (!block.recasts?.length) return contract;
  const reach = eventTermMonths(block, termMonths(block)) - offset;
  return Math.max(contract, reach);
}

/** A row that owes and pays nothing. */
const idleRow = (r: AmortizationRow): boolean =>
  !r.endBalance.greaterThan(ZERO) &&
  r.interest.plus(r.principal).plus(r.prepaid).isZero();

/** Drop the zero rows a longer build left past both the contract schedule and the
 *  loan's last payment (ADR 0109). */
function trimRepaid(
  rows: AmortizationRow[],
  contractMonths: number,
): AmortizationRow[] {
  let n = rows.length;
  while (n > contractMonths && idleRow(at(rows, n - 1))) n--;
  return n === rows.length ? rows : rows.slice(0, n);
}

/**
 * The grid month from which an idle row means the loan stays idle: past the contract
 * schedule and every month a tranche or an event touches. The build stops there
 * instead of running to a recast's 50-year reach; `trimRepaid` would drop the rest
 * anyway (ADR 0116).
 */
function quietFrom(
  contractMonths: number,
  events: LoanEvents,
  offset: number,
  draws: Map<number, Decimal> = new Map(),
): number {
  const paymentsAt = [
    ...events.prepaymentsAt.keys(),
    ...events.recastsAt.keys(),
  ];
  return Math.max(
    contractMonths,
    ...paymentsAt.map((p) => p - offset + 1),
    ...draws.keys(),
  );
}

/** Run a month step over the built grid, collecting rows and event outcomes, until
 *  `months` or the first idle row from month `quiet`. */
function runGrid<S>(
  state: S,
  months: number,
  quiet: number,
  step: (
    s: S,
    m: number,
  ) => { row: AmortizationRow; state: S; outcomes: Outcome[] },
): BlockSchedule {
  const rows: AmortizationRow[] = [];
  const outcomes: Outcome[] = [];
  let s = state;
  for (let m = 1; m <= months; m++) {
    const next = step(s, m);
    rows.push(next.row);
    outcomes.push(...next.outcomes);
    s = next.state;
    if (m >= quiet && idleRow(next.row)) break;
  }
  return { rows, outcomes };
}

function buildDevSchedule(
  block: DevelopmentLoan,
  assumptions: Assumptions,
): BlockSchedule {
  const { baseDate } = assumptions;
  const startToBase = paymentOffset(block, baseDate);
  const totalMonths = builtMonths(block, assumptions, startToBase);
  // Draws after the last payment due by baseDate emit in this baseDate-anchored loop
  // (a future loan: after baseDate); earlier ones were folded into the opening
  // balance by simulateToBaseDate. A tranche between that payment and baseDate lands
  // in grid month 1 and re-amortizes there (D-41, DR-016).
  // A tranche landing in grid month 1 is added before that row's split, so
  // `balanceAtMonth(schedule, 0)` includes it; the baseDate debt (`openingBalance`)
  // counts only the tranches dated on/before baseDate (D-44).
  const drawnAfter = isAfter(block.startDate, baseDate)
    ? baseDate
    : lastPaymentDue(block, baseDate);
  const ctx: DevScheduleContext = {
    block,
    assumptions,
    startToBase,
    drawsByMonth: bucketDraws(block.draws ?? [], baseDate, totalMonths, (d) =>
      isAfter(d, drawnAfter),
    ),
    newDebtByMonth: bucketDraws(block.draws ?? [], baseDate, totalMonths, (d) =>
      isAfter(d, baseDate),
    ),
    events: loanEvents(block, assumptions, (d) => isAfter(d, baseDate)),
  };
  const opening = initDevScheduleState(block, assumptions);
  const contract = scheduleMonths(block, assumptions);
  const quiet = quietFrom(contract, ctx.events, startToBase, ctx.drawsByMonth);
  const grid = runGrid(opening.state, totalMonths, quiet, (s, m) =>
    devMonthStep(s, m, ctx),
  );
  return {
    rows: trimRepaid(grid.rows, contract),
    outcomes: [...opening.outcomes, ...grid.outcomes],
  };
}

// ---------------------------------------------------------------------------
// Plain loans
// ---------------------------------------------------------------------------

/**
 * Opening state of a plain loan at baseDate: the closed-form balance at the original
 * rate while every payment due so far was at that rate and no prepayment or recast is
 * dated by baseDate (the parity path), else the payments are replayed with the reset
 * from the true fixation end (D-30, DR-100) and the events (ADR 0109).
 */
function plainOpening(
  block: PlainLoan,
  assumptions: Assumptions,
  offset: number,
): Opening & { prevRate: Decimal } {
  const lastRate = rateOfPayment(offset, block, assumptions);
  if (
    lastRate.equals(block.interestRatePa) &&
    !hasPastEvents(block, assumptions.baseDate)
  ) {
    return {
      balance: currentBalance(block, assumptions.baseDate),
      currentInstalment: block.monthlyInstalment,
      terms: initialTerms(block),
      outcomes: [],
      prevRate: block.interestRatePa,
    };
  }
  return { ...simulateToBaseDate(block, assumptions), prevRate: lastRate };
}

/** Running per-month state of the plain-loan grid. */
interface PlainScheduleState {
  balance: Decimal;
  currentInstalment: Decimal;
  prevRate: Decimal;
  drawn: boolean;
  terms: TermState;
}

/** Everything the plain-loan grid needs besides the running state. */
interface PlainScheduleContext {
  block: PlainLoan;
  assumptions: Assumptions;
  offset: number;
  /** Prepayments and recasts dated after baseDate (ADR 0109). */
  events: LoanEvents;
}

type PlainMonthStep = {
  row: AmortizationRow;
  state: PlainScheduleState;
  outcomes: Outcome[];
};

/** A future plain loan's month before it is drawn, or the month it draws in. */
function plainUndrawnStep(
  state: PlainScheduleState,
  block: PlainLoan,
  m: number,
  date: IsoDate,
): PlainMonthStep {
  const { row, drawsNow } = undrawnRow(block, m, date);
  const next = drawsNow
    ? { ...state, balance: row.endBalance, drawn: true }
    : state;
  return { row, state: next, outcomes: [] };
}

/** One month of the plain-loan grid: undrawn → draw → amortizing → repaid. The
 *  instalment re-amortizes on a rate change or after a prepayment that lowers it,
 *  over the payments left to the maturity in force (ADR 0109). */
function plainMonthStep(
  state: PlainScheduleState,
  m: number,
  ctx: PlainScheduleContext,
): PlainMonthStep {
  const { block, assumptions, offset } = ctx;
  const date = edate(assumptions.baseDate, m);
  if (!state.drawn) return plainUndrawnStep(state, block, m, date);
  const p = offset + m;
  const ratePa = rateOfPayment(p, block, assumptions);
  // Payoff guard (Decimal(0).isPositive() is true, so test with greaterThan).
  if (!state.balance.greaterThan(ZERO)) {
    return {
      row: zeroRow(m, date, ratePa),
      state: { ...state, prevRate: ratePa },
      outcomes: repaidOutcomes(ctx.events, p, m, state),
    };
  }
  const trigger = !ratePa.equals(state.prevRate);
  const pay = paymentTerms(state.terms, trigger, p, state.currentInstalment);
  const step = amortizeMonth(
    state.balance,
    ratePa,
    false,
    pay.instalment,
    pay.reamortizeOver,
    pay.atMaturity,
  );
  const settled = settleEvents(
    ctx.events,
    {
      p,
      month: m,
      balance: step.endBalance,
      ratePa,
      instalment: step.instalment,
      interestOnly: false,
      terms: paidTerms(state.terms, false),
    },
    eventsAt(ctx.events, p),
  );
  return {
    row: paymentRow({ month: m, date, ratePa, drawn: ZERO }, step, settled),
    state: {
      balance: settled.balance,
      currentInstalment: step.instalment,
      prevRate: ratePa,
      drawn: true,
      terms: settled.terms,
    },
    outcomes: settled.outcomes,
  };
}

/**
 * The single-draw schedule (the parity path). Opens at the baseDate balance (see
 * `plainOpening`), or draws a future loan on its grid month, and re-amortizes over the
 * constant-maturity remaining term whenever the rate changes — at fixation end and
 * when a scenario rate shock reverts. Once repaid it emits zero rows (payoff guard).
 */
function buildPlainSchedule(
  block: PlainLoan,
  assumptions: Assumptions,
): BlockSchedule {
  const { baseDate } = assumptions;
  const offset = paymentOffset(block, baseDate);
  const ctx: PlainScheduleContext = {
    block,
    assumptions,
    offset,
    events: loanEvents(block, assumptions, (d) => isAfter(d, baseDate)),
  };
  const opening: Opening & { prevRate: Decimal } = isAfter(
    block.startDate,
    baseDate,
  )
    ? {
        balance: ZERO,
        currentInstalment: block.monthlyInstalment,
        terms: initialTerms(block),
        outcomes: [],
        prevRate: block.interestRatePa,
      }
    : plainOpening(block, assumptions, offset);
  const state: PlainScheduleState = {
    balance: opening.balance,
    currentInstalment: opening.currentInstalment,
    prevRate: opening.prevRate,
    drawn: !isAfter(block.startDate, baseDate),
    terms: opening.terms,
  };
  const contract = scheduleMonths(block, assumptions);
  const grid = runGrid(
    state,
    builtMonths(block, assumptions, offset),
    quietFrom(contract, ctx.events, offset),
    (s, m) => plainMonthStep(s, m, ctx),
  );
  return {
    rows: trimRepaid(grid.rows, contract),
    outcomes: [...opening.outcomes, ...grid.outcomes],
  };
}

// ---------------------------------------------------------------------------
// Public schedule API
// ---------------------------------------------------------------------------

/** One block's schedule and its event outcomes; raises on an invalid loan (D-17). */
function blockSchedule(
  block: MortgageBlock,
  assumptions: Assumptions,
): BlockSchedule {
  assertLoanInputs(block);
  return isDevLoan(block)
    ? buildDevSchedule(block, assumptions)
    : buildPlainSchedule(block, assumptions);
}

/**
 * Month-by-month schedule for one block, from baseDate for at least `horizonYears*12`
 * months (longer when the loan needs its full term). A future block is undrawn (zero
 * rows) until the first grid month on/after `startDate`, where it draws
 * `initialPrincipal` and then amortizes. Development loans (tranches or interest-only)
 * take the development path; plain loans reproduce the parity targets byte-for-byte.
 * An invalid loan raises an EngineInputError (D-17).
 */
export function buildSchedule(
  block: MortgageBlock,
  assumptions: Assumptions,
): AmortizationRow[] {
  return blockSchedule(block, assumptions).rows;
}

/**
 * Outstanding balance at a baseDate-anchored schedule month (0 = opening balance).
 * Clamped to the schedule's range: a month past the end pins to the final (typically
 * zero) balance. Fixation-aware because the schedule models the post-fixation reset.
 */
export function balanceAtMonth(
  schedule: AmortizationRow[],
  month: number,
): Decimal {
  if (schedule.length === 0) return ZERO;
  const m = Math.max(0, Math.min(month, schedule.length));
  if (m <= 0) {
    // Opening balance = first row's start balance = endBalance + principal +
    // prepaid (ADR 0109).
    const first = at(schedule, 0);
    return first.endBalance.plus(first.principal).plus(first.prepaid);
  }
  return at(schedule, m - 1).endBalance;
}

/**
 * Debt outstanding at baseDate on one block: 0 for a loan drawn after baseDate, even
 * when it draws in grid month 1 (D-33, DR-106); else the balance the schedule opens
 * from, plus a tranche dated after the last payment due and on/before baseDate (D-41).
 * A tranche dated after baseDate is new debt in the month it lands, not opening debt,
 * even when it lands in grid month 1 (D-44, DR-121).
 */
export function openingBalance(
  block: MortgageBlock,
  assumptions: Assumptions,
): Decimal {
  const { baseDate } = assumptions;
  if (isAfter(block.startDate, baseDate)) return ZERO;
  assertLoanInputs(block);
  if (!isDevLoan(block)) {
    const offset = paymentOffset(block, baseDate);
    return plainOpening(block, assumptions, offset).balance;
  }
  const lastDue = lastPaymentDue(block, baseDate);
  return (block.draws ?? [])
    .filter((d) => isAfter(d.date, lastDue) && isOnOrBefore(d.date, baseDate))
    .reduce(
      (sum, d) => sum.plus(d.amount),
      simulateToBaseDate(block, assumptions).balance,
    );
}

/** Opening (baseDate) debt of a property: its block in force at baseDate, if any. */
export function openingDebt(
  blocks: MortgageBlock[],
  assumptions: Assumptions,
): Decimal {
  assertBlockStarts(blocks);
  const block = selectBlock(blocks, assumptions.baseDate);
  return block ? openingBalance(block, assumptions) : ZERO;
}

/**
 * Instalment & rate in force at a baseDate-anchored schedule month — reads the
 * row at that month so a future as-of date past the fixation reset reflects the
 * re-amortized instalment and reset rate. Month ≤ 0 (baseDate) uses the first row.
 * A month with a prepayment reports the next row's instalment at the same rate: the
 * balance at that month has already had the prepayment taken off (ADR 0116).
 */
export function instalmentAtMonth(
  schedule: AmortizationRow[],
  month: number,
): { instalment: Decimal; ratePa: Decimal } {
  if (schedule.length === 0) return { instalment: ZERO, ratePa: ZERO };
  const idx = Math.max(0, Math.min(month, schedule.length) - 1);
  const row = at(schedule, Math.max(0, idx));
  const next = schedule[idx + 1];
  const after =
    month >= 1 &&
    row.prepaid.greaterThan(ZERO) &&
    next !== undefined &&
    next.ratePa.equals(row.ratePa);
  return {
    instalment: after ? next.instalment : row.instalment,
    ratePa: row.ratePa,
  };
}

// ---------------------------------------------------------------------------
// Refinance chains (D-27, D-43, D-47)
// ---------------------------------------------------------------------------

/**
 * The blocks that drive a property's schedule: the block in force at baseDate (else
 * the earliest upcoming one), then each later start in order — a successor replaces
 * its predecessor from its start (D-27, D-43). Earlier blocks are already replaced.
 */
export function blockChain(
  blocks: MortgageBlock[],
  baseDate: Date,
): MortgageBlock[] {
  const chain: MortgageBlock[] = [];
  let block = selectBlock(blocks, baseDate);
  while (block) {
    chain.push(block);
    block = firstAfter(blocks, block.startDate, (b) => b.startDate);
  }
  return chain;
}

/**
 * Splice `next` into the chain's rows from its draw month `d` (D-47). The owner's
 * payment in month d is still paid when due on/before the successor's start, and the
 * draw row carries it; otherwise the owner pays off its balance before month d. An
 * owner drawn in month d itself (two successors in one grid month) pays off its draw.
 * A prepayment dated on/before the successor's start that the owner's dropped rows
 * carried is paid at the handover, before the successor pays off the rest (ADR 0109).
 */
function spliceSuccessor(
  current: BlockSchedule,
  owner: MortgageBlock,
  next: MortgageBlock,
  assumptions: Assumptions,
): BlockSchedule & { refinance: Refinance } {
  const { rows } = current;
  const { baseDate } = assumptions;
  const d = drawMonth(next, baseDate);
  const successor = blockSchedule(next, assumptions);
  const nextRows = successor.rows;
  const drawRow = at(nextRows, d - 1);
  // Rows past the owner's schedule are undrawn months of the successor.
  const head = [...rows.slice(0, d - 1), ...nextRows.slice(rows.length, d - 1)];
  const own = rows[d - 1];
  const due = edate(owner.startDate, paymentOffset(owner, baseDate) + d);
  const kept =
    own !== undefined &&
    own.interest.plus(own.principal).greaterThan(ZERO) &&
    isOnOrBefore(due, next.startDate);
  const { before, carriedIn } = handoverBalances(head, own, d);
  const owed =
    own && (kept || drawMonth(owner, baseDate) === d) ? own.endBalance : before;
  const late = handoverPrepayments(current.outcomes, owner, d, kept, owed);
  const row =
    own && kept ? { ...own, endBalance: drawRow.endBalance } : drawRow;
  const prepaid = row.prepaid.plus(late.applied);
  const merged = {
    ...row,
    prepaid,
    prepaymentFee: row.prepaymentFee.plus(late.fee),
    drawn: row.endBalance.minus(carriedIn).plus(row.principal).plus(prepaid),
  };
  return {
    rows: [...head, merged, ...nextRows.slice(d)],
    outcomes: [...late.outcomes, ...successor.outcomes],
    refinance: {
      month: d,
      paidOff: owed.minus(late.applied),
      drawn: drawRow.endBalance,
    },
  };
}

/**
 * The owner's events in rows the handover drops (month d unless kept, and later):
 * each prepayment is paid at the handover, in order, out of the balance `owed`; a
 * recast no longer applies, as the successor replaces the loan (ADR 0109).
 */
function handoverPrepayments(
  outcomes: Outcome[],
  owner: MortgageBlock,
  d: number,
  kept: boolean,
  owed: Decimal,
): { applied: Decimal; fee: Decimal; outcomes: Outcome[] } {
  const dropped = (o: Outcome) =>
    o.blockId === owner.id &&
    o.month !== null &&
    (o.month > d || (o.month === d && !(kept && o.kind === "prepayment")));
  let [left, applied, fee] = [owed, ZERO, ZERO];
  const out = outcomes.map((o): Outcome => {
    if (!dropped(o)) return o;
    if (o.kind === "recast")
      return { ...o, month: null, issue: "RECAST_REPLACED" };
    const paid = o.requested.lessThan(left) ? o.requested : left;
    const charged = paid.greaterThan(ZERO) ? (o.enteredFee ?? ZERO) : ZERO;
    [left, applied, fee] = [
      left.minus(paid),
      applied.plus(paid),
      fee.plus(charged),
    ];
    const issue = prepaymentIssue(o.requested, paid);
    return { ...o, month: d, applied: paid, fee: charged, issue };
  });
  return { applied, fee, outcomes: out };
}

/**
 * The owner's balance going into the handover month `d` (`before`, what the successor
 * pays off unless the owner's month-d row is kept) and the balance carried into the
 * merged row: the handover's net new debt (DR-092) is what the successor draws, less
 * the predecessor balance it pays off, plus anything the kept row itself drew.
 */
function handoverBalances(
  head: AmortizationRow[],
  own: AmortizationRow | undefined,
  d: number,
): { before: Decimal; carriedIn: Decimal } {
  if (d > 1) {
    const before = head.at(-1)?.endBalance ?? ZERO;
    return { before, carriedIn: before };
  }
  if (!own) return { before: ZERO, carriedIn: ZERO };
  const before = own.endBalance.plus(own.principal).plus(own.prepaid);
  return { before, carriedIn: before.minus(own.drawn) };
}

/** An event a successor replaced before it applied (ADR 0109). */
function replacedOutcome(
  block: MortgageBlock,
  kind: Outcome["kind"],
  e: { date: IsoDate; amount?: Decimal },
): Outcome {
  return {
    blockId: block.id,
    kind,
    date: e.date,
    month: null,
    requested: e.amount ?? ZERO,
    applied: ZERO,
    fee: ZERO,
    issue: kind === "prepayment" ? "PREPAYMENT_REPLACED" : "RECAST_REPLACED",
  };
}

/** A block cut at its successor's start: its tranches, prepayments and recasts dated
 *  after it are dropped, the events reported (D-47, DR-126, ADR 0109). */
function cutAt(
  block: MortgageBlock,
  next: MortgageBlock,
): { block: MortgageBlock; dropped: Outcome[] } {
  const keep = (e: { date: Date }) => isOnOrBefore(e.date, next.startDate);
  const dropped = [
    ...(block.prepayments ?? [])
      .filter((p) => !keep(p))
      .map((p) => replacedOutcome(block, "prepayment", p)),
    ...(block.recasts ?? [])
      .filter((r) => !keep(r))
      .map((r) => replacedOutcome(block, "recast", r)),
  ];
  const draws = block.draws?.filter(keep);
  const unchanged =
    dropped.length === 0 && draws?.length === block.draws?.length;
  if (unchanged) return { block, dropped };
  return {
    block: mortgageBlock({
      ...block,
      draws,
      prepayments: block.prepayments?.filter(keep),
      recasts: block.recasts?.filter(keep),
    }),
    dropped,
  };
}

/**
 * Drop each block's tranches dated after its successor's start: the successor replaces
 * the block from that date, so they are never drawn, even one in the successor's draw
 * month that the kept draw row would otherwise carry (D-47, DR-126). Its prepayments
 * and recasts dated after that start go too, and are reported (ADR 0109).
 */
function untilSuccessor(chain: MortgageBlock[]): {
  chain: MortgageBlock[];
  dropped: Outcome[];
} {
  const cut = chain.map((block, i) => {
    const next = chain[i + 1];
    return next ? cutAt(block, next) : { block, dropped: [] };
  });
  return {
    chain: cut.map((c) => c.block),
    dropped: cut.flatMap((c) => c.dropped),
  };
}

/** One property's schedule rows, the refinance handovers it made, and what its
 *  prepayments and recasts did (ADR 0109). */
export interface PropertySchedule {
  rows: AmortizationRow[];
  refinances: Refinance[];
  eventOutcomes: LoanEventOutcome[];
}

/**
 * One property's schedule on the baseDate grid, following its refinance chain: each
 * successor block starting after baseDate replaces its predecessor from the grid month
 * it draws in (D-27, D-47), with the handovers it made. Blocks on the same start
 * overlap and raise DUPLICATE_BLOCK_START (D-43). No block ⇒ no rows.
 */
export function propertySchedule(
  blocks: MortgageBlock[],
  assumptions: Assumptions,
): PropertySchedule {
  assertLoanRows(blocks); // D-37
  assertBlockStarts(blocks);
  const { chain, dropped } = untilSuccessor(
    blockChain(blocks, assumptions.baseDate),
  );
  const [first, ...successors] = chain;
  if (!first) return { rows: [], refinances: [], eventOutcomes: [] };
  let schedule = blockSchedule(first, assumptions);
  let owner = first;
  const refinances: Refinance[] = [];
  for (const next of successors) {
    const step = spliceSuccessor(schedule, owner, next, assumptions);
    schedule = step;
    refinances.push(step.refinance);
    owner = next;
  }
  return {
    rows: schedule.rows,
    refinances,
    eventOutcomes: [...schedule.outcomes, ...dropped].map(publicOutcome),
  };
}

/** An outcome without the internal entered fee. */
function publicOutcome(o: Outcome): LoanEventOutcome {
  const { enteredFee, ...rest } = o;
  void enteredFee;
  return rest;
}

/**
 * `propertySchedule` for every property keyed by propertyId (no rows if no debt), built
 * once so the snapshot, projection and KPIs can share it (DR-042).
 */
export function propertySchedules(
  mortgages: MortgageBlock[],
  propertyIds: string[],
  assumptions: Assumptions,
): Map<string, PropertySchedule> {
  assertAssumptions(assumptions); // D-37
  const result = new Map<string, PropertySchedule>();
  for (const pid of propertyIds) {
    const propBlocks = mortgages.filter((b) => b.propertyId === pid);
    result.set(pid, propertySchedule(propBlocks, assumptions));
  }
  return result;
}

/** The rows of each property's schedule (see `propertySchedules`). */
export function scheduleRows(
  schedules: Map<string, PropertySchedule>,
): Map<string, AmortizationRow[]> {
  return new Map([...schedules].map(([pid, s]) => [pid, s.rows]));
}

/** Build schedules for every property keyed by propertyId (empty if no debt). */
export function schedulesByProperty(
  mortgages: MortgageBlock[],
  propertyIds: string[],
  assumptions: Assumptions,
): Map<string, AmortizationRow[]> {
  return scheduleRows(propertySchedules(mortgages, propertyIds, assumptions));
}
