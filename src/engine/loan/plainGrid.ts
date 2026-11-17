// The plain-loan grid: the single-draw schedule (the parity path).
import { ZERO, type Decimal } from "../../lib/money";
import { edate, isAfter } from "../dates";
import { dueDate, scheduleMonths } from "../amortization";
import type {
  AmortizationRow,
  Assumptions,
  IsoDate,
  PlainLoan,
} from "../types";
import { zeroRow, undrawnRow } from "./kernel";
import { paymentOffset, rateOfPayment } from "./calendar";
import {
  type TermState,
  initialTerms,
  type LoanEvents,
  loanEvents,
  type Outcome,
} from "./events";
import { payAndSettle, paymentRow } from "./pay";
import { type Opening, plainOpening } from "./opening";
import {
  repaidOutcomes,
  type BlockSchedule,
  builtMonths,
  trimRepaid,
  quietFrom,
  runGrid,
} from "./grid";

// ---------------------------------------------------------------------------
// Plain loans
// ---------------------------------------------------------------------------

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
  const { step, settled } = payAndSettle(
    ctx.events,
    { ...state, prevInterestOnly: false },
    { p, month: m, draw: ZERO, fresh: ZERO, ratePa, io: false },
  );
  return {
    row: paymentRow(
      {
        month: m,
        date,
        dueDate: dueDate(block, p),
        ratePa,
        drawn: ZERO,
      },
      step,
      settled,
    ),
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
export function buildPlainSchedule(
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
    quietFrom(contract, ctx.events, offset, []),
    (s, m) => plainMonthStep(s, m, ctx),
  );
  return {
    rows: trimRepaid(grid.rows, contract),
    outcomes: [...opening.outcomes, ...grid.outcomes],
  };
}
