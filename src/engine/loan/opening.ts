// A loan's opening state at baseDate: the catch-up from startDate (D-30, ADR 0109).
import { ZERO, type Decimal } from "../../lib/money";
import { isAfter, isOnOrBefore } from "../dates";
import {
  currentBalance,
  dueDate,
  isDevLoan,
  paymentsDueBy,
  rateAt,
  scheduledInstalment,
  selectBlock,
} from "../amortization";
import { assertBlockStarts, assertLoanInputs } from "../validate";
import type { Assumptions, MortgageBlock, PlainLoan } from "../types";
import {
  paymentOffset,
  lastPaymentDue,
  rateOfPayment,
  interestOnlyAt,
  bucketDraws,
  lateTranches,
  sumDraws,
} from "./calendar";
import {
  type TermState,
  initialTerms,
  type LoanEvents,
  loanEvents,
  eventsAt,
  type Outcome,
  settleEvents,
} from "./events";
import { type PayState, payAndSettle } from "./pay";

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
export interface Opening {
  balance: Decimal;
  currentInstalment: Decimal;
  terms: TermState;
  outcomes: Outcome[];
}

type CatchUpState = Opening & PayState;

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
  const { block, assumptions } = ctx.events;
  const date = dueDate(block, k);
  const draw = ctx.drawsByStep.get(k) ?? ZERO;
  const ratePa = rateAt(date, block, assumptions);
  const io = interestOnlyAt(block, date);
  const { step, settled } = payAndSettle(ctx.events, s, {
    p: k,
    month: k - ctx.steps,
    draw,
    fresh: draw,
    ratePa,
    io,
  });
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
 * simulate month-by-month on the loan's OWN cadence (`dueDate(block, k)`) for the
 * payments due by baseDate — counted like `currentBalance` (D-21). Development loans
 * always take this path; plain loans once their fixation has ended (D-30) or when an
 * event is dated on/before baseDate (ADR 0109). Returns the balance, the instalment
 * and the maturity in force at baseDate, which the baseDate-anchored schedule opens
 * from.
 */
export function simulateToBaseDate(
  block: MortgageBlock,
  assumptions: Assumptions,
): Opening & { counted: Decimal } {
  const { baseDate } = assumptions;
  const steps = paymentsDueBy(block, baseDate);
  const ctx: CatchUpContext = {
    events: loanEvents(block, assumptions, (d) => isOnOrBefore(d, baseDate)),
    // Only tranches up to the last payment due: a later one (still on/before
    // baseDate) belongs to the next payment period, grid month 1 (D-41, DR-016).
    drawsByStep: bucketDraws(block.draws ?? [], block.startDate, (d) =>
      isOnOrBefore(d, lastPaymentDue(block, baseDate)),
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
  // follow that payment (or the start, when none is due yet), and see the late
  // tranches dated on or before them (ADR 0129 §1).
  const tranches = lateTranches(block, baseDate);
  const late = settleEvents(
    ctx.events,
    {
      p: steps,
      month: 0,
      balance: s.balance,
      instalment: s.currentInstalment,
      interestOnly: s.prevInterestOnly,
      terms: s.terms,
    },
    eventsAt(ctx.events, steps + 1),
    (date) => sumDraws(tranches.filter((d) => isOnOrBefore(d.date, date))),
  );
  return {
    balance: late.balance,
    currentInstalment: s.currentInstalment,
    terms: late.terms,
    outcomes: [...s.outcomes, ...late.outcomes],
    counted: late.counted,
  };
}

/**
 * Opening state of a plain loan at baseDate: the closed-form balance at the original
 * rate while every payment due so far was at that rate and no prepayment or recast is
 * dated by baseDate (the parity path), else the payments are replayed with the reset
 * from the true fixation end (D-30, DR-100) and the events (ADR 0109).
 */
export function plainOpening(
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
  return simulateToBaseDate(block, assumptions).balance.plus(
    sumDraws(lateTranches(block, baseDate)),
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
