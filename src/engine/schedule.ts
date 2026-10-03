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
  instalmentFor,
  isDevLoan,
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
  MortgageBlock,
  MortgageDraw,
  PlainLoan,
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

/** Months left to startDate + term at payment `m` (the constant-maturity rule). */
function remainingTerm(term: number, elapsedAtAnchor: number, m: number) {
  return term - elapsedAtAnchor - (m - 1);
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
// Catch-up from startDate to baseDate
// ---------------------------------------------------------------------------

/**
 * Opening state of a loan already running at baseDate. The closed-form
 * `currentBalance` (a single FV at the original rate) can't see tranches,
 * interest-only months or a fixation that already ended, so we simulate
 * month-by-month on the loan's OWN cadence (`edate(startDate, k)`) for the payments
 * due by baseDate — counted like `currentBalance` (D-21). Development loans always
 * take this path; plain loans only once their fixation has ended (D-30). Returns the
 * balance and the instalment in force at baseDate, which the baseDate-anchored
 * schedule opens from.
 */
function simulateToBaseDate(
  block: MortgageBlock,
  assumptions: Assumptions,
): { balance: Decimal; currentInstalment: Decimal } {
  const { baseDate } = assumptions;
  const steps = lastGridMonthOnOrBefore(block.startDate, baseDate);
  const term = termMonths(block);
  // Only tranches up to the last payment due: a later one (still on/before baseDate)
  // belongs to the next payment period, grid month 1 (D-41, DR-016).
  const drawsByStep = bucketDraws(
    block.draws ?? [],
    block.startDate,
    Math.max(1, steps),
    (d) => isOnOrBefore(d, lastPaymentDue(block, baseDate)),
  );

  let balance: Decimal = block.initialPrincipal;
  let currentInstalment = scheduledInstalment(block);
  let prevRate = rateAt(block.startDate, block, assumptions);
  let prevInterestOnly = interestOnlyAt(block, block.startDate);

  for (let k = 1; k <= steps; k++) {
    const date = edate(block.startDate, k);
    const draw = drawsByStep.get(k) ?? ZERO;
    const ratePa = rateAt(date, block, assumptions);
    const io = interestOnlyAt(block, date);
    const trigger = reamortizes(draw, prevInterestOnly, io, ratePa, prevRate);
    const step = amortizeMonth(
      balance.plus(draw),
      ratePa,
      io,
      currentInstalment,
      trigger ? remainingTerm(term, 0, k) : null,
      k >= term,
    );
    balance = step.endBalance;
    currentInstalment = step.instalment;
    prevRate = ratePa;
    prevInterestOnly = io;
  }
  return { balance, currentInstalment };
}

/** Running per-month state of the development-loan grid. */
interface DevScheduleState {
  balance: Decimal;
  currentInstalment: Decimal;
  drawn: boolean;
  prevRate: Decimal;
  prevInterestOnly: boolean;
}

function initDevScheduleState(
  block: DevelopmentLoan,
  assumptions: Assumptions,
): DevScheduleState {
  const { baseDate } = assumptions;
  if (isAfter(block.startDate, baseDate)) {
    return {
      balance: ZERO,
      currentInstalment: scheduledInstalment(block),
      drawn: false,
      prevRate: block.interestRatePa,
      prevInterestOnly: false,
    };
  }
  const sim = simulateToBaseDate(block, assumptions);
  return {
    balance: sim.balance,
    currentInstalment: sim.currentInstalment,
    drawn: true,
    prevRate: rateOfPayment(paymentOffset(block, baseDate), block, assumptions),
    prevInterestOnly: interestOnlyAt(block, baseDate),
  };
}

/** Everything the development-loan grid needs besides the running state. */
interface DevScheduleContext {
  block: DevelopmentLoan;
  assumptions: Assumptions;
  term: number;
  startToBase: number;
  drawsByMonth: Map<number, Decimal>;
  /** The tranches dated after baseDate, by grid month: the new debt a row draws
   *  (DR-092). A tranche on/before baseDate that lands in grid month 1 is opening
   *  debt (D-41, D-44). */
  newDebtByMonth: Map<number, Decimal>;
}

type DevMonthStep = { row: AmortizationRow; state: DevScheduleState };

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
  if (!drawsNow) return { row, state };
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
  const draw = ctx.drawsByMonth.get(m) ?? ZERO;
  const ratePa = rateOfPayment(ctx.startToBase + m, block, assumptions);
  const io = interestOnlyAt(block, date);
  // Payoff guard, as in the plain grid: once repaid (and no tranche lands) nothing
  // is due, rather than the held instalment on a zero balance (DR-044).
  if (!state.balance.plus(draw).greaterThan(ZERO)) {
    return {
      row: zeroRow(m, date, ratePa),
      state: { ...state, prevRate: ratePa, prevInterestOnly: io },
    };
  }
  const trigger = reamortizes(
    draw,
    state.prevInterestOnly,
    io,
    ratePa,
    state.prevRate,
  );
  const step = amortizeMonth(
    state.balance.plus(draw),
    ratePa,
    io,
    state.currentInstalment,
    trigger ? remainingTerm(ctx.term, ctx.startToBase, m) : null,
    ctx.startToBase + m >= ctx.term,
  );
  const drawn = ctx.newDebtByMonth.get(m) ?? ZERO;
  return {
    row: { month: m, date, ratePa, drawn, ...step },
    state: {
      balance: step.endBalance,
      currentInstalment: io ? state.currentInstalment : step.instalment,
      drawn: true,
      prevRate: ratePa,
      prevInterestOnly: io,
    },
  };
}

function buildDevSchedule(
  block: DevelopmentLoan,
  assumptions: Assumptions,
): AmortizationRow[] {
  const { baseDate } = assumptions;
  const totalMonths = scheduleMonths(block, assumptions);
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
    term: termMonths(block),
    startToBase: paymentOffset(block, baseDate),
    drawsByMonth: bucketDraws(block.draws ?? [], baseDate, totalMonths, (d) =>
      isAfter(d, drawnAfter),
    ),
    newDebtByMonth: bucketDraws(block.draws ?? [], baseDate, totalMonths, (d) =>
      isAfter(d, baseDate),
    ),
  };
  let state = initDevScheduleState(block, assumptions);
  const rows: AmortizationRow[] = [];
  for (let m = 1; m <= totalMonths; m++) {
    const next = devMonthStep(state, m, ctx);
    rows.push(next.row);
    state = next.state;
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Plain loans
// ---------------------------------------------------------------------------

/**
 * Opening state of a plain loan at baseDate: the closed-form balance at the original
 * rate while every payment due so far was at that rate (the parity path), else the
 * payments are replayed with the reset from the true fixation end (D-30, DR-100).
 */
function plainOpening(
  block: PlainLoan,
  assumptions: Assumptions,
  offset: number,
): { balance: Decimal; currentInstalment: Decimal; prevRate: Decimal } {
  const lastRate = rateOfPayment(offset, block, assumptions);
  if (lastRate.equals(block.interestRatePa)) {
    return {
      balance: currentBalance(block, assumptions.baseDate),
      currentInstalment: block.monthlyInstalment,
      prevRate: block.interestRatePa,
    };
  }
  return { ...simulateToBaseDate(block, assumptions), prevRate: lastRate };
}

/**
 * The single-draw schedule (the parity path). Opens at the baseDate balance (see
 * `plainOpening`), or draws a future loan on its grid month, and re-amortizes over the
 * constant-maturity remaining term whenever the rate changes — at fixation end and
 * when a scenario rate shock reverts. Once repaid it emits zero rows (payoff guard).
 */
/** Running per-month state of the plain-loan grid. */
interface PlainScheduleState {
  balance: Decimal;
  currentInstalment: Decimal;
  prevRate: Decimal;
  drawn: boolean;
}

/** Everything the plain-loan grid needs besides the running state. */
interface PlainScheduleContext {
  block: PlainLoan;
  assumptions: Assumptions;
  term: number;
  offset: number;
}

type PlainMonthStep = { row: AmortizationRow; state: PlainScheduleState };

/** One month of the plain-loan grid: undrawn → draw → amortizing → repaid. */
function plainMonthStep(
  state: PlainScheduleState,
  m: number,
  ctx: PlainScheduleContext,
): PlainMonthStep {
  const { block, assumptions, term, offset } = ctx;
  const date = edate(assumptions.baseDate, m);
  if (!state.drawn) {
    const { row, drawsNow } = undrawnRow(block, m, date);
    return drawsNow
      ? { row, state: { ...state, balance: row.endBalance, drawn: true } }
      : { row, state };
  }
  const ratePa = rateOfPayment(offset + m, block, assumptions);
  // Payoff guard (Decimal(0).isPositive() is true, so test with greaterThan).
  if (!state.balance.greaterThan(ZERO)) {
    return {
      row: zeroRow(m, date, ratePa),
      state: { ...state, prevRate: ratePa },
    };
  }
  const step = amortizeMonth(
    state.balance,
    ratePa,
    false,
    state.currentInstalment,
    ratePa.equals(state.prevRate) ? null : remainingTerm(term, offset, m),
    offset + m >= term,
  );
  return {
    row: { month: m, date, ratePa, drawn: ZERO, ...step },
    state: {
      balance: step.endBalance,
      currentInstalment: step.instalment,
      prevRate: ratePa,
      drawn: true,
    },
  };
}

function buildPlainSchedule(
  block: PlainLoan,
  assumptions: Assumptions,
): AmortizationRow[] {
  const { baseDate } = assumptions;
  const offset = paymentOffset(block, baseDate);
  const futureStart = isAfter(block.startDate, baseDate);
  const ctx: PlainScheduleContext = {
    block,
    assumptions,
    term: termMonths(block),
    offset,
  };
  let state: PlainScheduleState = futureStart
    ? {
        balance: ZERO,
        currentInstalment: block.monthlyInstalment,
        prevRate: block.interestRatePa,
        drawn: false,
      }
    : { ...plainOpening(block, assumptions, offset), drawn: true };
  const rows: AmortizationRow[] = [];
  const totalMonths = scheduleMonths(block, assumptions);
  for (let m = 1; m <= totalMonths; m++) {
    const next = plainMonthStep(state, m, ctx);
    rows.push(next.row);
    state = next.state;
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Public schedule API
// ---------------------------------------------------------------------------

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
  assertLoanInputs(block);
  return isDevLoan(block)
    ? buildDevSchedule(block, assumptions)
    : buildPlainSchedule(block, assumptions);
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
    // Opening balance = first row's start balance = endBalance + principal.
    const first = at(schedule, 0);
    return first.endBalance.plus(first.principal);
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
 */
export function instalmentAtMonth(
  schedule: AmortizationRow[],
  month: number,
): { instalment: Decimal; ratePa: Decimal } {
  if (schedule.length === 0) return { instalment: ZERO, ratePa: ZERO };
  const idx = Math.max(0, Math.min(month, schedule.length) - 1);
  const row = at(schedule, Math.max(0, idx));
  return { instalment: row.instalment, ratePa: row.ratePa };
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
 */
function spliceSuccessor(
  rows: AmortizationRow[],
  owner: MortgageBlock,
  next: MortgageBlock,
  assumptions: Assumptions,
): { rows: AmortizationRow[]; refinance: Refinance } {
  const { baseDate } = assumptions;
  const d = drawMonth(next, baseDate);
  const nextRows = buildSchedule(next, assumptions);
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
  const paidOff =
    own && (kept || drawMonth(owner, baseDate) === d) ? own.endBalance : before;
  const row =
    own && kept ? { ...own, endBalance: drawRow.endBalance } : drawRow;
  const merged = {
    ...row,
    drawn: row.endBalance.minus(carriedIn).plus(row.principal),
  };
  return {
    rows: [...head, merged, ...nextRows.slice(d)],
    refinance: { month: d, paidOff, drawn: drawRow.endBalance },
  };
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
  const before = own.endBalance.plus(own.principal);
  return { before, carriedIn: before.minus(own.drawn) };
}

/**
 * Drop each block's tranches dated after its successor's start: the successor replaces
 * the block from that date, so they are never drawn, even one in the successor's draw
 * month that the kept draw row would otherwise carry (D-47, DR-126).
 */
function untilSuccessor(chain: MortgageBlock[]): MortgageBlock[] {
  return chain.map((block, i) => {
    const next = chain[i + 1];
    if (!next || !block.draws) return block;
    const draws = block.draws.filter((d) =>
      isOnOrBefore(d.date, next.startDate),
    );
    return draws.length === block.draws.length ? block : { ...block, draws };
  });
}

/** One property's schedule rows and the refinance handovers it made. */
export interface PropertySchedule {
  rows: AmortizationRow[];
  refinances: Refinance[];
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
  const [first, ...successors] = untilSuccessor(
    blockChain(blocks, assumptions.baseDate),
  );
  if (!first) return { rows: [], refinances: [] };
  let rows = buildSchedule(first, assumptions);
  let owner = first;
  const refinances: Refinance[] = [];
  for (const next of successors) {
    const step = spliceSuccessor(rows, owner, next, assumptions);
    rows = step.rows;
    refinances.push(step.refinance);
    owner = next;
  }
  return { rows, refinances };
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
