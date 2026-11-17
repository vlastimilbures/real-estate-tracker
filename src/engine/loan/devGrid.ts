// The development-loan grid (D-24, D-41, D-44).
import { ZERO, type Decimal } from "../../lib/money";
import { edate, isAfter } from "../dates";
import {
  dueDate,
  instalmentFor,
  scheduledInstalment,
  scheduleMonths,
} from "../amortization";
import type {
  AmortizationRow,
  Assumptions,
  DevelopmentLoan,
  IsoDate,
} from "../types";
import { zeroRow, undrawnRow } from "./kernel";
import {
  paymentOffset,
  lastPaymentDue,
  rateOfPayment,
  interestOnlyAt,
  bucketDraws,
} from "./calendar";
import {
  type TermState,
  initialTerms,
  type LoanEvents,
  loanEvents,
  type Outcome,
} from "./events";
import { payAndSettle, paymentRow } from "./pay";
import { simulateToBaseDate } from "./opening";
import {
  repaidOutcomes,
  type BlockSchedule,
  builtMonths,
  trimRepaid,
  quietFrom,
  runGrid,
} from "./grid";

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
): { state: DevScheduleState; outcomes: Outcome[]; counted: Decimal } {
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
      counted: ZERO,
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
        dueDate(block, paymentOffset(block, baseDate)),
      ),
      terms: sim.terms,
    },
    outcomes: sim.outcomes,
    counted: sim.counted,
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
  /** The part of grid month 1's tranches a late-window event already counted in the
   *  terms it set: no second contract-term restore or agreed-instalment deferral for
   *  it (ADR 0129 §1). */
  openingCounted: Decimal;
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
      // Payment 0, on the loan start (ADR 0129 §2).
      prevInterestOnly: interestOnlyAt(
        block,
        dueDate(block, ctx.startToBase + m),
      ),
    },
    outcomes: [],
  };
}

/** One grid month of a drawn development loan: what payment `p` meets. */
interface DevMonth {
  m: number;
  p: number;
  date: IsoDate;
  /** Payment p's due date, EDATE(start, p) (ADR 0164). */
  dueDate: IsoDate;
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
  const { m, date, draw, ratePa, io } = mo;
  const fresh = m === 1 ? draw.minus(ctx.openingCounted) : draw;
  const { step, settled } = payAndSettle(ctx.events, state, {
    ...mo,
    month: m,
    fresh,
  });
  const drawn = ctx.newDebtByMonth.get(m) ?? ZERO;
  const head = { month: m, date, dueDate: mo.dueDate, ratePa, drawn };
  return {
    row: paymentRow(head, step, settled),
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
  const due = dueDate(block, p);
  const io = interestOnlyAt(block, due); // ADR 0129 §2
  // Payoff guard, as in the plain grid: once repaid (and no tranche lands) nothing
  // is due, rather than the held instalment on a zero balance (DR-044).
  if (!state.balance.plus(draw).greaterThan(ZERO)) {
    return {
      row: zeroRow(m, date, ratePa),
      state: { ...state, prevRate: ratePa, prevInterestOnly: io },
      outcomes: repaidOutcomes(ctx.events, p, m, state),
    };
  }
  const mo = { m, p, date, dueDate: due, draw, ratePa, io };
  return devPaymentStep(state, mo, ctx);
}

export function buildDevSchedule(
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
  const opening = initDevScheduleState(block, assumptions);
  const ctx: DevScheduleContext = {
    block,
    assumptions,
    startToBase,
    drawsByMonth: bucketDraws(block.draws ?? [], baseDate, (d) =>
      isAfter(d, drawnAfter),
    ),
    newDebtByMonth: bucketDraws(block.draws ?? [], baseDate, (d) =>
      isAfter(d, baseDate),
    ),
    events: loanEvents(block, assumptions, (d) => isAfter(d, baseDate)),
    openingCounted: opening.counted,
  };
  const contract = scheduleMonths(block, assumptions);
  const quiet = quietFrom(
    contract,
    ctx.events,
    startToBase,
    ctx.drawsByMonth.keys(),
  );
  const grid = runGrid(opening.state, totalMonths, quiet, (s, m) =>
    devMonthStep(s, m, ctx),
  );
  return {
    rows: trimRepaid(grid.rows, contract),
    outcomes: [...opening.outcomes, ...grid.outcomes],
  };
}
