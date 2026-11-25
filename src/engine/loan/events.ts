// Prepayments and recasts of the loan schedule (ADR 0109).
import { ZERO, type Decimal } from "../../lib/money";
import {
  maxTermMonths,
  nperMonths,
  paymentOnOrAfter,
  paymentsDueBy,
  termMonths,
} from "../loanTerm";
import type {
  Assumptions,
  LoanEventIssue,
  LoanEventOutcome,
  LoanRecast,
  MortgageBlock,
  MortgagePrepayment,
  PrepaymentEffect,
} from "../types";
import { recomputeInstalment, type PaymentTerms } from "./kernel";
import { rateOfPayment, bucketByStep } from "./calendar";
import { monthlyRate } from "../units";

// ---------------------------------------------------------------------------
// Prepayments and recasts (ADR 0109)
// ---------------------------------------------------------------------------

/**
 * The loan's last payment number in force — the contract term until a prepayment
 * shortens it or a recast moves it — and what the next payment owes: a
 * re-amortization over the payments left, or an agreed instalment (ADR 0109).
 */
export interface TermState {
  term: number;
  reamortizeNext: boolean;
  agreedInstalment: Decimal | null;
}

export function initialTerms(block: MortgageBlock): TermState {
  return {
    term: termMonths(block),
    reamortizeNext: false,
    agreedInstalment: null,
  };
}

/** After an amortizing payment nothing is owed to the next one any more, except when
 *  it paid an agreed instalment on a tranche (`draw`): the tranche then re-amortizes
 *  the next payment (ADR 0120). Through interest-only months it stays owed (completion
 *  re-amortizes anyway). */
export function paidTerms(
  terms: TermState,
  interestOnly: boolean,
  draw: Decimal,
): TermState {
  if (interestOnly) return terms;
  return {
    ...terms,
    reamortizeNext: terms.agreedInstalment !== null && draw.greaterThan(ZERO),
    agreedInstalment: null,
  };
}

/**
 * How payment `p` is paid: the agreed instalment, else the instalment in force,
 * re-amortized over the payments left to the maturity in force (constant maturity)
 * when `trigger` fires or a prepayment owes it; the payment at that maturity clears
 * the balance (D-40).
 */
export function paymentTerms(
  terms: TermState,
  trigger: boolean,
  p: number,
  instalment: Decimal,
): PaymentTerms {
  const agreed = terms.agreedInstalment;
  return {
    instalment: agreed ?? instalment,
    agreed: agreed !== null,
    reamortizeOver:
      agreed === null && (trigger || terms.reamortizeNext)
        ? terms.term - (p - 1)
        : null,
    atMaturity: p >= terms.term,
  };
}

/** A tranche landing on or after the maturity in force goes back to the contract term
 *  (ADR 0109, ADR 0116), so it is not paid off in one shot. */
export function termsForTranche(
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
export interface LoanEvents {
  block: MortgageBlock;
  assumptions: Assumptions;
  contractTerm: number;
  prepaymentsAt: Map<number, MortgagePrepayment[]>;
  recastsAt: Map<number, LoanRecast[]>;
}

/** The events `include` accepts (by date), each after the first payment due on or
 *  after its date — on the loan's own cadence, so moving baseDate never moves it. */
export function loanEvents(
  block: MortgageBlock,
  assumptions: Assumptions,
  include: (d: Date) => boolean,
): LoanEvents {
  const payment = (d: Date) => paymentOnOrAfter(block, d);
  return {
    block,
    assumptions,
    contractTerm: termMonths(block),
    prepaymentsAt: bucketByStep(byDate(block.prepayments), include, payment),
    recastsAt: bucketByStep(byDate(block.recasts), include, payment),
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

export function eventsAt(ev: LoanEvents, k: number): PeriodEvents {
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
  instalment: Decimal;
  interestOnly: boolean;
  terms: TermState;
}

/** An event outcome plus, for a prepayment, the fee entered with it: a handover that
 *  pays the prepayment charges that fee (ADR 0116). Internal; stripped on output. */
export type Outcome = LoanEventOutcome & { enteredFee?: Decimal };

export interface Settled {
  balance: Decimal;
  prepaid: Decimal;
  fee: Decimal;
  terms: TermState;
  outcomes: Outcome[];
  /** The seen tranches behind the terms the events set: grid month 1 does not treat
   *  them as a new tranche again (ADR 0129 §1). Zero outside the late settle. */
  counted: Decimal;
}

const larger = (a: Decimal, b: Decimal): Decimal => (a.greaterThan(b) ? a : b);

function prepaymentIssue(
  requested: Decimal,
  applied: Decimal,
): LoanEventIssue | null {
  if (!applied.greaterThan(ZERO)) return "PREPAYMENT_AFTER_PAYOFF";
  return applied.lessThan(requested) ? "PREPAYMENT_EXCEEDS_BALANCE" : null;
}

/**
 * A prepayment of `requested` paid out of `available`: at most what is left, charged its
 * entered `fee` only when it repays something, with the issue it is reported with
 * (ADR 0109, ADR 0116). The one clamp of the schedule's prepayments and the handover's.
 */
export function clampPrepayment(
  requested: Decimal,
  available: Decimal,
  fee: Decimal | undefined,
): { applied: Decimal; charged: Decimal; issue: LoanEventIssue | null } {
  const applied = requested.lessThan(available) ? requested : available;
  const charged = applied.greaterThan(ZERO) ? (fee ?? ZERO) : ZERO;
  return { applied, charged, issue: prepaymentIssue(requested, applied) };
}

/**
 * What an event sees on top of the balance it settles against: the late tranches
 * (after the last payment due by baseDate, on/before baseDate) dated on or before the
 * event. They join grid month 1 (D-41), so only the late settle counts them; every
 * other settle sees none (ADR 0129 §1).
 */
type SeenTranches = (date: Date) => Decimal;
const NO_TRANCHES: SeenTranches = () => ZERO;

/** Pay the period's prepayments in date order, each clamped to the balance left plus
 *  the tranches it sees. `seenAfter` is what the last applied one saw. */
function applyPrepayments(
  ev: LoanEvents,
  done: PaymentDone,
  prepayments: MortgagePrepayment[],
  seen: SeenTranches,
): Omit<Settled, "terms" | "counted"> & {
  effect: PrepaymentEffect | null;
  seenAfter: Decimal;
} {
  let { balance } = done;
  let [prepaid, fee, seenAfter] = [ZERO, ZERO, ZERO];
  let effect: PrepaymentEffect | null = null;
  const outcomes: Outcome[] = [];
  for (const p of prepayments) {
    const available = balance.plus(seen(p.date));
    const { applied, charged, issue } = clampPrepayment(
      p.amount,
      available,
      p.fee,
    );
    if (applied.greaterThan(ZERO)) {
      [balance, prepaid, fee] = [
        balance.minus(applied),
        prepaid.plus(applied),
        fee.plus(charged),
      ];
      effect = p.effect;
      seenAfter = seen(p.date);
    }
    outcomes.push({
      blockId: ev.block.id,
      kind: "prepayment",
      date: p.date,
      month: done.month,
      requested: p.amount,
      applied,
      fee: charged,
      issue,
      enteredFee: p.fee ?? ZERO,
    });
  }
  return { balance, prepaid, fee, effect, seenAfter, outcomes };
}

/**
 * The bank's answer to the period's prepayments, once, on the balance after all of
 * them (the last one's effect): lower the instalment from the next payment, or keep
 * the instalment already set for the next payment and end the loan after `ceil(NPER)`
 * more payments at the next payment's rate (ADR 0179). That instalment is
 * an agreed one still to pay (a recast after this payment, settled in the late window;
 * ADR 0136); else, when the next payment owes a re-amortization, the annuity of
 * `before` (the balance before the prepayments) over the payments left; else this
 * payment's (a rate change or tranche on the next payment is not anticipated). The
 * maturity never moves later: when that instalment does not repay the
 * loan by it (or never covers the interest), the term stays and the prepayment is
 * reported as not shortening it.
 * Interest-only months pay no instalment to keep: completion re-amortizes anyway.
 */
function prepaymentTerms(
  ev: LoanEvents,
  effect: PrepaymentEffect | null,
  done: PaymentDone,
  before: Decimal,
): { terms: TermState; repaysByMaturity: boolean } {
  const { terms, balance } = done;
  if (!effect || done.interestOnly || !balance.greaterThan(ZERO)) {
    return { terms, repaysByMaturity: true };
  }
  if (effect === "lowerInstalment") {
    return {
      terms: { ...terms, reamortizeNext: true },
      repaysByMaturity: true,
    };
  }
  const next = monthlyRate(rateOfPayment(done.p + 1, ev.block, ev.assumptions));
  const kept =
    terms.agreedInstalment ??
    (terms.reamortizeNext
      ? recomputeInstalment(next, terms.term - done.p, before)
      : done.instalment);
  const left = nperMonths(next, kept, balance);
  const sized = Number.isFinite(left) && left > 0;
  return {
    terms: sized
      ? { ...terms, term: Math.min(terms.term, done.p + left) }
      : terms,
    repaysByMaturity: sized && done.p + left <= terms.term,
  };
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
  const next = monthlyRate(rateOfPayment(done.p + 1, ev.block, ev.assumptions));
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

/** The period's recasts in date order, each on the balance plus the tranches it sees;
 *  `counted` is what the last one that set new terms saw. */
function applyRecasts(
  ev: LoanEvents,
  done: PaymentDone,
  recasts: LoanRecast[],
  seen: SeenTranches,
): { terms: TermState; outcomes: Outcome[]; counted: Decimal } {
  let { terms } = done;
  let counted = ZERO;
  const outcomes: Outcome[] = [];
  for (const r of recasts) {
    const balance = done.balance.plus(seen(r.date));
    const result = balance.greaterThan(ZERO)
      ? recastTerms(ev, { ...done, balance, terms }, r)
      : { terms, issue: "RECAST_AFTER_PAYOFF" as const };
    if (result.terms !== terms) counted = seen(r.date);
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
  return { terms, outcomes, counted };
}

/** The last applied prepayment — the one whose `shortenTerm` effect applies — is
 *  reported as not shortening the term (ADR 0179). */
function notShortened(outcomes: Outcome[]): Outcome[] {
  const last = outcomes.reduce(
    (at, o, i) => (o.applied.greaterThan(ZERO) ? i : at),
    -1,
  );
  return outcomes.map((o, i) =>
    i === last ? { ...o, issue: "PREPAYMENT_TERM_NOT_SHORTENED" } : o,
  );
}

/** After payment `p`: its prepayments, the bank's answer to them, then its recasts
 *  (ADR 0109). The balance checks count the tranches `seen` names (ADR 0129 §1); the
 *  balance returned does not, so the tranche is still added once, in grid month 1. */
export function settleEvents(
  ev: LoanEvents,
  done: PaymentDone,
  period: PeriodEvents,
  seen: SeenTranches = NO_TRANCHES,
): Settled {
  if (period.prepayments.length === 0 && period.recasts.length === 0) {
    return { ...done, prepaid: ZERO, fee: ZERO, outcomes: [], counted: ZERO };
  }
  const paid = applyPrepayments(ev, done, period.prepayments, seen);
  const after = { ...done, balance: paid.balance };
  const { terms, repaysByMaturity } = prepaymentTerms(
    ev,
    paid.effect,
    { ...after, balance: paid.balance.plus(paid.seenAfter) },
    done.balance.plus(paid.seenAfter),
  );
  const recast = applyRecasts(ev, { ...after, terms }, period.recasts, seen);
  return {
    balance: paid.balance,
    prepaid: paid.prepaid,
    fee: paid.fee,
    terms: recast.terms,
    outcomes: [
      ...(repaysByMaturity ? paid.outcomes : notShortened(paid.outcomes)),
      ...recast.outcomes,
    ],
    counted: larger(
      terms === done.terms ? ZERO : paid.seenAfter,
      recast.counted,
    ),
  };
}
