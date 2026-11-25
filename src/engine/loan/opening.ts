// A loan's opening state at baseDate: the catch-up from startDate (D-30, ADR 0109).
import { ZERO, type Decimal } from "../../lib/money";
import { isAfter, isOnOrBefore } from "../dates";
import { isDevLoan } from "../loanBlock";
import { paymentsDueBy } from "../loanTerm";
import { rateAt } from "../loanRate";
import { scheduledInstalment } from "../loanInstalment";
import { selectBlock } from "./blockChain";
import { assertBlockStarts, assertLoanInputs } from "../validate";
import type { Assumptions, MortgageBlock, PlainLoan } from "../types";
import {
  lastPaymentDue,
  interestOnlyAt,
  bucketDraws,
  lateTranches,
  sumDraws,
} from "./calendar";
import {
  type TermState,
  initialTerms,
  loanEvents,
  eventsAt,
  type Outcome,
  settleEvents,
} from "./events";
import { type LoanState, type Run, stepMonth } from "./pay";

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

/**
 * Opening state of a loan already running at baseDate: we simulate month-by-month on
 * the loan's OWN cadence (`dueDate(block, k)`) for the payments due by baseDate
 * (`paymentsDueBy`, D-21), so tranches, interest-only months, a fixation that already
 * ended (D-30) and events dated on/before baseDate (ADR 0109) are all seen. Every
 * running loan takes this path, plain ones too (ADR 0235). Returns the balance, the
 * instalment and the maturity in force at baseDate, which the baseDate-anchored
 * schedule opens from.
 */
export function simulateToBaseDate(
  block: MortgageBlock,
  assumptions: Assumptions,
): Opening & { counted: Decimal } {
  const { baseDate } = assumptions;
  const steps = paymentsDueBy(block, baseDate);
  // Only tranches up to the last payment due: a later one (still on/before
  // baseDate) belongs to the next payment period, grid month 1 (D-41, DR-016).
  const drawsByStep = bucketDraws(block.draws ?? [], block.startDate, (d) =>
    isOnOrBefore(d, lastPaymentDue(block, baseDate)),
  );
  // Payment k on the loan's own cadence is grid month k − steps (months 1 − steps
  // to 0), so `offset + m` is k. The rows are not kept.
  const run: Run = {
    block,
    assumptions,
    events: loanEvents(block, assumptions, (d) => isOnOrBefore(d, baseDate)),
    offset: steps,
    drawsByMonth: new Map(
      [...drawsByStep].map(([k, amount]) => [k - steps, amount]),
    ),
    newDebtByMonth: new Map<number, Decimal>(),
    openingCounted: ZERO,
    sizeFirst: null,
    replay: true,
  };
  let s: LoanState = {
    balance: block.initialPrincipal,
    currentInstalment: scheduledInstalment(block),
    drawn: true,
    prevRate: rateAt(block.startDate, block, assumptions),
    prevInterestOnly: interestOnlyAt(block, block.startDate),
    terms: initialTerms(block),
  };
  const outcomes: Outcome[] = [];
  for (let m = 1 - steps; m <= 0; m++) {
    const next = stepMonth(s, m, run);
    outcomes.push(...next.outcomes);
    s = next.state;
  }
  // Events after the last payment due and on/before baseDate are history too: they
  // follow that payment (or the start, when none is due yet), and see the late
  // tranches dated on or before them (ADR 0129 §1).
  const tranches = lateTranches(block, baseDate);
  const late = settleEvents(
    run.events,
    {
      p: steps,
      month: 0,
      balance: s.balance,
      instalment: s.currentInstalment,
      interestOnly: s.prevInterestOnly,
      terms: s.terms,
    },
    eventsAt(run.events, steps + 1),
    (date) => sumDraws(tranches.filter((d) => isOnOrBefore(d.date, date))),
  );
  return {
    balance: late.balance,
    currentInstalment: s.currentInstalment,
    terms: late.terms,
    outcomes: [...outcomes, ...late.outcomes],
    counted: late.counted,
  };
}

/**
 * Opening state of a plain loan at baseDate: its payments due so far replayed month
 * by month (ADR 0235), with the reset from the true fixation end (D-30, DR-100) and
 * the events (ADR 0109). A plain loan has no tranches, so nothing is counted.
 */
export function plainOpening(
  block: PlainLoan,
  assumptions: Assumptions,
): Opening {
  const { balance, currentInstalment, terms, outcomes } = simulateToBaseDate(
    block,
    assumptions,
  );
  return { balance, currentInstalment, terms, outcomes };
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
  if (!isDevLoan(block)) return plainOpening(block, assumptions).balance;
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
