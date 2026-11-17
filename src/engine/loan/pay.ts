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
import type { AmortizationRow } from "../types";
import { type MonthStep, amortizeMonth, reamortizes } from "./kernel";
import {
  type TermState,
  paidTerms,
  paymentTerms,
  termsForTranche,
  type LoanEvents,
  eventsAt,
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
