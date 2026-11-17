// Monthly amortization schedules with the Czech fixation reset (SPEC §4.4).
//
// One payment kernel (`payAndSettle`: pay payment p — tranche terms, re-amortization
// trigger, `amortizeMonth` — then settle its prepayments and recasts) drives all three
// loops: the plain-loan grid, the development-loan grid, and the catch-up from
// startDate to baseDate. The catch-up opens every development loan running at
// baseDate, and a plain loan once the rate of its last payment due differs from the
// contract rate (fixation ended, D-30) or an event is dated by baseDate (ADR 0109).
// The loops differ only where the behaviour differs, and each difference is named
// below rather than silently unified:
//   • payoff guard — both grids emit zero rows once the balance is repaid (DR-044);
//   • re-amortization trigger — plain: a rate change; development: a tranche landing,
//     the end of interest-only, or a rate change (D-24). Any loan also re-amortizes
//     when an event owes it: a lowerInstalment prepayment, a maturity recast or a
//     capped instalment recast (ADR 0109), or a tranche on the payment of an agreed
//     instalment (ADR 0120). Between these the instalment holds, or the agreed one is
//     paid; a development loan opens with the annuity of its principal over the
//     required term (D-31, `scheduledInstalment`);
//   • instalment during interest-only — the catch-up adopts the interest as the
//     instalment in force; the grid keeps the pre-interest-only instalment.
//
// Calendar (D-21, J-03 a′): rows sit on the baseDate grid EDATE(baseDate, m), but each
// row carries payment number p = paymentsDueAtBase + m (running loan) or m − drawMonth
// (future loan), and its rate and interest-only are read on that payment's due date
// EDATE(start, p) (ADR 0129 §2). So the payment due on the fixation end is still at
// the fixed rate (DR-101), and a clamped month-end due date counts as paid (DR-070).
// Tranche landing stays on the grid.
import { ZERO, type Decimal } from "../../lib/money";
import { edate } from "../dates";
import { dueDate } from "../amortization";
import type {
  AmortizationRow,
  Assumptions,
  IsoDate,
  MortgageBlock,
} from "../types";
import {
  type MonthStep,
  amortizeMonth,
  reamortizes,
  undrawnRow,
  zeroRow,
} from "./kernel";
import { rateOfPayment, interestOnlyAt } from "./calendar";
import {
  type TermState,
  paidTerms,
  paymentTerms,
  termsForTranche,
  type LoanEvents,
  eventsAt,
  type Outcome,
  type Settled,
  settleEvents,
} from "./events";

/** The running loan a payment meets; every loop carries it (plain: never interest-only). */
export interface PayState {
  balance: Decimal;
  currentInstalment: Decimal;
  terms: TermState;
  prevRate: Decimal;
  prevInterestOnly: boolean;
}

/** What payment `p` (grid month `month`) meets. `draw` lands before the split; `fresh`
 *  is its part no late-window event already counted (ADR 0129 §1): the part that
 *  restores the contract term or owes the next payment a re-amortization. */
interface PaymentMonth {
  p: number;
  month: number;
  draw: Decimal;
  fresh: Decimal;
  ratePa: Decimal;
  io: boolean;
}

/** Payment `p`, then its prepayments and recasts (ADR 0109): the step all three loops
 *  share. Each caller keeps only what it does with the result. */
export function payAndSettle(
  ev: LoanEvents,
  s: PayState,
  mo: PaymentMonth,
): { step: MonthStep; settled: Settled } {
  const { p, draw, fresh, ratePa, io } = mo;
  const terms = termsForTranche(s.terms, fresh, p, ev.contractTerm);
  const trigger = reamortizes(draw, s.prevInterestOnly, io, ratePa, s.prevRate);
  const pay = paymentTerms(terms, trigger, p, s.currentInstalment);
  const step = amortizeMonth(s.balance.plus(draw), ratePa, io, pay);
  const settled = settleEvents(
    ev,
    {
      p,
      month: mo.month,
      balance: step.endBalance,
      instalment: step.instalment,
      interestOnly: io,
      terms: paidTerms(terms, io, fresh),
    },
    eventsAt(ev, p),
  );
  return { step, settled };
}

/** A paid month's row: the payment, then the prepayments it was followed by. */
export function paymentRow(
  head: Pick<
    AmortizationRow,
    "month" | "date" | "dueDate" | "ratePa" | "drawn"
  >,
  step: MonthStep,
  settled: Settled,
): AmortizationRow {
  return {
    ...head,
    ...step,
    refinanced: ZERO,
    prepaid: settled.prepaid,
    prepaymentFee: settled.fee,
    endBalance: settled.balance,
  };
}

/** Events meeting a repaid loan: nothing to prepay, no maturity to change. */
export function repaidOutcomes(
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
      instalment: state.currentInstalment,
      interestOnly: false,
      terms: state.terms,
    },
    eventsAt(ev, p),
  ).outcomes;
}

/** The running loan a month step meets: what a payment meets, and whether it is drawn. */
export interface LoanState extends PayState {
  drawn: boolean;
}

/** Everything a month step needs besides the running state. */
export interface Run {
  block: MortgageBlock;
  assumptions: Assumptions;
  /** The prepayments and recasts the run settles (ADR 0109). */
  events: LoanEvents;
  /** Grid month m carries payment `offset + m` (D-21). */
  offset: number;
  /** The tranches each month draws before its split. */
  drawsByMonth: Map<number, Decimal>;
  /** The tranches dated after baseDate, by grid month: the new debt a row draws
   *  (DR-092). A tranche on/before baseDate that lands in grid month 1 is opening
   *  debt (D-41, D-44). */
  newDebtByMonth: Map<number, Decimal>;
  /** The part of grid month 1's tranches a late-window event already counted in the
   *  terms it set: no second contract-term restore or agreed-instalment deferral for
   *  it (ADR 0129 §1). */
  openingCounted: Decimal;
  /** The instalment of the first draw, sized on the drawn amount over the full term;
   *  null keeps the instalment in force (a plain loan keeps the entered one). */
  sizeFirst: ((balance: Decimal) => Decimal) | null;
  /** The catch-up to baseDate: no payoff guard, and the interest is the instalment in
   *  force during interest-only. */
  replay: boolean;
}

/** One month of a run: its row, the state it leaves, what its events did. */
export interface MonthResult {
  row: AmortizationRow;
  state: LoanState;
  outcomes: Outcome[];
}

/** True while the loan owes something this month (`draw` lands before the split).
 *  (`greaterThan`, because `Decimal(0).isPositive()` is true.) */
export function owes(state: PayState, draw: Decimal): boolean {
  return state.balance.plus(draw).greaterThan(ZERO);
}

/** One month of a run: undrawn → first draw → interest-only → amortizing → repaid.
 *  A later tranche landing this month grows the balance before this month's split
 *  (unlike the first draw, which carries no payment). A tranche landing in the first
 *  draw's month joins that draw (D-46, DR-122). */
export function stepMonth(state: LoanState, m: number, run: Run): MonthResult {
  const { block, assumptions } = run;
  const date = edate(assumptions.baseDate, m);
  if (!state.drawn) return drawStep(state, m, date, run);
  const p = run.offset + m;
  const draw = run.drawsByMonth.get(m) ?? ZERO;
  const ratePa = rateOfPayment(p, block, assumptions);
  const due = dueDate(block, p);
  const io = interestOnlyAt(block, due); // ADR 0129 §2
  // Payoff guard: once repaid (and no tranche lands) nothing is due, rather than the
  // held instalment on a zero balance (DR-044). The catch-up replays without it.
  if (!run.replay && !owes(state, draw)) {
    return {
      row: zeroRow(m, date, ratePa),
      state: { ...state, prevRate: ratePa, prevInterestOnly: io },
      outcomes: repaidOutcomes(run.events, p, m, state),
    };
  }
  return paidStep(state, { m, p, date, dueDate: due, draw, ratePa, io }, run);
}

/** A month before the first draw: nothing owed, or the first draw landing (it carries
 *  no payment; with `sizeFirst` and a tranche joining it, the instalment is sized on
 *  the drawn amount over the full term). */
function drawStep(
  state: LoanState,
  m: number,
  date: IsoDate,
  run: Run,
): MonthResult {
  const { block, assumptions } = run;
  const { row, drawsNow } = undrawnRow(block, m, date);
  if (!drawsNow) return { row, state, outcomes: [] };
  const tranche = run.drawsByMonth.get(m) ?? ZERO;
  const balance = row.endBalance.plus(tranche);
  return {
    row: { ...row, drawn: balance, endBalance: balance },
    state: {
      ...state,
      balance,
      currentInstalment:
        tranche.greaterThan(ZERO) && run.sizeFirst
          ? run.sizeFirst(balance)
          : state.currentInstalment,
      drawn: true,
      prevRate: rateOfPayment(run.offset + m, block, assumptions),
      // Payment 0, on the loan start (ADR 0129 §2).
      prevInterestOnly: interestOnlyAt(block, dueDate(block, run.offset + m)),
    },
    outcomes: [],
  };
}

/** One month of a run: what payment `p` meets. */
interface RunMonth {
  m: number;
  p: number;
  date: IsoDate;
  /** Payment p's due date, EDATE(start, p) (ADR 0164). */
  dueDate: IsoDate;
  draw: Decimal;
  ratePa: Decimal;
  io: boolean;
}

/** A drawn loan's payment `p`, then its prepayments and recasts. */
function paidStep(state: LoanState, mo: RunMonth, run: Run): MonthResult {
  const { m, date, draw, ratePa, io } = mo;
  const fresh = m === 1 ? draw.minus(run.openingCounted) : draw;
  const { step, settled } = payAndSettle(run.events, state, {
    ...mo,
    month: m,
    fresh,
  });
  const drawn = run.newDebtByMonth.get(m) ?? ZERO;
  const head = { month: m, date, dueDate: mo.dueDate, ratePa, drawn };
  return {
    row: paymentRow(head, step, settled),
    state: {
      balance: settled.balance,
      currentInstalment:
        io && !run.replay ? state.currentInstalment : step.instalment,
      drawn: true,
      prevRate: ratePa,
      prevInterestOnly: io,
      terms: settled.terms,
    },
    outcomes: settled.outcomes,
  };
}
