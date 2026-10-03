// Financing exposure and upcoming events (ADR 0103, #31). Read off the same schedules the
// projection uses, so every balance matches the amortization table:
//   • fixation end = blockEndDate; its payment is still fixed (D-21), so the balance at
//     fixation end is the end balance of grid month fixationYears*12 − paymentOffset;
//   • a loan is a property's block chain (D-27), its payoff the schedule's last payment.
// Dates are modelled from the entered data, not lender deadlines (the wording is UI).
import { ZERO, type Decimal } from "../lib/money";
import { drawMonth, isDevLoan, mortgageBlock } from "./amortization";
import { DEBT_FREE_EPSILON } from "./constants";
import {
  edate,
  firstAfter,
  isAfter,
  isOnOrBefore,
  lastGridMonthOnOrBefore,
} from "./dates";
import { leaseInForce } from "./metrics";
import { blockChain, paymentOffset, propertySchedule } from "./schedule";
import type {
  AmortizationRow,
  Assumptions,
  IsoDate,
  MortgageBlock,
  Portfolio,
} from "./types";

/** One block's fixation end and the debt exposed to the reset after it. */
export interface FixationReset {
  propertyId: string;
  blockId: string;
  fixationEnd: IsoDate;
  /** Grid month of the fixation-end payment (the reset row is the next one). */
  gridMonth: number;
  /** passed: on/before as-of · replaced: a successor takes over first · repaid: no
   *  balance left by then · upcoming: otherwise. */
  status: "upcoming" | "passed" | "replaced" | "repaid";
  /** Balance after the fixation-end payment; 0 unless upcoming. */
  balance: Decimal;
}

/** One property's loan (its block chain) as of the exposure's as-of date. */
export interface LoanExposure {
  propertyId: string;
  /** The block in force at as-of, else the first upcoming one. */
  blockId: string;
  nextFixation: FixationReset | null;
  /** Due date of the schedule's last payment (the modelled payoff). */
  payoffDate: IsoDate | null;
  /** Schedule months from as-of to the last payment (0 once repaid). */
  remainingMonths: number | null;
  /** Interest the loan's prepayments save to payoff; null without one (ADR 0116). */
  interestSaved: Decimal | null;
}

export interface FinancingExposure {
  asOf: IsoDate;
  loans: LoanExposure[];
  resets: FixationReset[];
}

export type FinancingEventKind =
  "fixationEnd" | "loanPayoff" | "devCompletion" | "leaseEnd";

export interface FinancingEvent {
  date: IsoDate;
  kind: FinancingEventKind;
  propertyId: string;
  /** The balance at a fixation end. */
  amount?: Decimal;
}

const KIND_ORDER: FinancingEventKind[] = [
  "fixationEnd",
  "loanPayoff",
  "devCompletion",
  "leaseEnd",
];

/** True when `date` is in (asOf, asOf + months]. */
function inWindow(date: Date, asOf: Date, months: number): boolean {
  return isAfter(date, asOf) && isOnOrBefore(date, edate(asOf, months));
}

/** The status of a fixation end at grid month `m`, before the balance is read. */
function resetStatus(
  fixationEnd: Date,
  m: number,
  next: MortgageBlock | undefined,
  rows: AmortizationRow[],
  ctx: { asOf: Date; baseDate: Date },
): FixationReset["status"] {
  if (isOnOrBefore(fixationEnd, ctx.asOf)) return "passed";
  if (
    next &&
    (isOnOrBefore(next.startDate, fixationEnd) ||
      drawMonth(next, ctx.baseDate) <= m)
  )
    return "replaced";
  const row = rows[m - 1];
  if (!row || row.endBalance.lessThanOrEqualTo(DEBT_FREE_EPSILON))
    return "repaid";
  return "upcoming";
}

/** Each chain block's fixation end (none for a 0-year, floating block). */
function chainResets(
  chain: MortgageBlock[],
  rows: AmortizationRow[],
  ctx: { asOf: Date; baseDate: Date },
): FixationReset[] {
  const resets: FixationReset[] = [];
  for (const [i, block] of chain.entries()) {
    if (block.fixationYears === 0) continue;
    const fixationEnd = edate(block.startDate, block.fixationYears * 12);
    const m = block.fixationYears * 12 - paymentOffset(block, ctx.baseDate);
    const status = resetStatus(fixationEnd, m, chain[i + 1], rows, ctx);
    resets.push({
      propertyId: block.propertyId,
      blockId: block.id,
      fixationEnd,
      gridMonth: m,
      status,
      balance: status === "upcoming" ? (rows[m - 1]?.endBalance ?? ZERO) : ZERO,
    });
  }
  return resets;
}

/** Grid month of the schedule's last payment, 0 if it has none. A prepayment counts:
 *  it can be the only cash of a month (ADR 0109). */
function lastPaymentMonth(rows: AmortizationRow[]): number {
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    if (r?.interest.plus(r.principal).plus(r.prepaid).greaterThan(ZERO))
      return i + 1;
  }
  return 0;
}

/** Due date of grid month `m`'s payment on the block paying it (drawn before `m`). */
function dueDate(chain: MortgageBlock[], m: number, baseDate: Date): IsoDate {
  const payers = chain.filter((b) => drawMonth(b, baseDate) < m);
  const owner = payers.at(-1) ?? chain[0];
  if (!owner) throw new RangeError("dueDate: empty chain");
  return edate(owner.startDate, paymentOffset(owner, baseDate) + m);
}

const interestOf = (rows: AmortizationRow[]): Decimal =>
  rows.reduce((s, r) => s.plus(r.interest), ZERO);

/**
 * Interest a property's prepayments save over the rest of its loans' life: the chain's
 * interest from grid month 1 to payoff with every prepayment removed (those before
 * baseDate too), minus the same in `rows`, the schedule built with them. Recasts stay.
 * Null when no block of the chain has a prepayment (ADR 0116).
 */
export function prepaymentInterestSaved(
  blocks: MortgageBlock[],
  assumptions: Assumptions,
  rows: AmortizationRow[],
): Decimal | null {
  const chain = blockChain(blocks, assumptions.baseDate);
  if (!chain.some((b) => b.prepayments?.length)) return null;
  const without = blocks.map((b) =>
    b.prepayments?.length ? mortgageBlock({ ...b, prepayments: undefined }) : b,
  );
  return interestOf(propertySchedule(without, assumptions).rows).minus(
    interestOf(rows),
  );
}

/** One property's loan exposure and resets (none without a loan). */
function propertyExposure(
  blocks: MortgageBlock[],
  rows: AmortizationRow[],
  ctx: { asOf: IsoDate; assumptions: Assumptions; baseDate: Date },
): { loan: LoanExposure; resets: FixationReset[] } | null {
  const chain = blockChain(blocks, ctx.baseDate);
  const first = chain[0];
  if (!first) return null;
  const resets = chainResets(chain, rows, ctx);
  const inForce = chain.filter((b) => isOnOrBefore(b.startDate, ctx.asOf));
  const last = lastPaymentMonth(rows);
  const elapsed = lastGridMonthOnOrBefore(ctx.baseDate, ctx.asOf);
  return {
    loan: {
      propertyId: first.propertyId,
      blockId: (inForce.at(-1) ?? first).id,
      nextFixation: resets.find((r) => r.status === "upcoming") ?? null,
      payoffDate: last > 0 ? dueDate(chain, last, ctx.baseDate) : null,
      remainingMonths: last > 0 ? Math.max(0, last - elapsed) : null,
      interestSaved: prepaymentInterestSaved(blocks, ctx.assumptions, rows),
    },
    resets,
  };
}

/**
 * Each active property's loan as of `asOf` (next fixation, modelled payoff, remaining
 * term) and every chain block's fixation end, from `schedules` (the rows built from the
 * same portfolio and assumptions). Pure; `asOf` is explicit (ADR 0103).
 */
export function financingExposure(
  portfolio: Portfolio,
  assumptions: Assumptions,
  schedules: Map<string, AmortizationRow[]>,
  asOf: IsoDate,
): FinancingExposure {
  const ctx = { asOf, assumptions, baseDate: assumptions.baseDate };
  const loans: LoanExposure[] = [];
  const resets: FixationReset[] = [];
  const active = portfolio.properties.filter((p) => p.active !== false);
  for (const id of new Set(active.map((p) => p.id))) {
    const blocks = portfolio.mortgages.filter((b) => b.propertyId === id);
    const one = propertyExposure(blocks, schedules.get(id) ?? [], ctx);
    if (!one) continue;
    loans.push(one.loan);
    resets.push(...one.resets);
  }
  return { asOf, loans, resets };
}

/** Σ balances at the upcoming fixation ends in (as-of, as-of + `years`] (ADR 0103). */
export function debtResettingWithin(
  fx: FinancingExposure,
  years: number,
): { amount: Decimal; loans: number } {
  const hit = fx.resets.filter(
    (r) =>
      r.status === "upcoming" && inWindow(r.fixationEnd, fx.asOf, years * 12),
  );
  return {
    amount: hit.reduce((s, r) => s.plus(r.balance), ZERO),
    loans: hit.length,
  };
}

/** A development block's completion, unless a successor replaces it first. */
function completions(
  portfolio: Portfolio,
  fx: FinancingExposure,
): FinancingEvent[] {
  const events: FinancingEvent[] = [];
  for (const loan of fx.loans) {
    const blocks = portfolio.mortgages.filter(
      (b) => b.propertyId === loan.propertyId,
    );
    const chain = blockChain(blocks, fx.asOf);
    for (const [i, b] of chain.entries()) {
      const done = isDevLoan(b) ? b.completionDate : undefined;
      const next = chain[i + 1];
      if (!done || (next && isOnOrBefore(next.startDate, done))) continue;
      events.push({
        date: done,
        kind: "devCompletion",
        propertyId: b.propertyId,
      });
    }
  }
  return events;
}

/** The in-force lease's end for each active property, when no later lease is entered. */
function leaseEnds(portfolio: Portfolio, asOf: Date): FinancingEvent[] {
  const events: FinancingEvent[] = [];
  const active = portfolio.properties.filter((p) => p.active !== false);
  for (const id of new Set(active.map((p) => p.id))) {
    const leases = portfolio.leases.filter((l) => l.propertyId === id);
    const lease = leaseInForce(leases, asOf);
    if (!lease?.endDate) continue;
    if (firstAfter(leases, lease.startDate, (l) => l.startDate)) continue;
    events.push({ date: lease.endDate, kind: "leaseEnd", propertyId: id });
  }
  return events;
}

/**
 * Fixation ends (with the balance), modelled payoffs, development completions and lease
 * ends without a follow-on lease, in (as-of, as-of + `months`], sorted by date, then
 * kind, then property (ADR 0103).
 */
export function upcomingEvents(
  portfolio: Portfolio,
  fx: FinancingExposure,
  months: number,
): FinancingEvent[] {
  const resets: FinancingEvent[] = fx.resets
    .filter((r) => r.status === "upcoming")
    .map((r) => ({
      date: r.fixationEnd,
      kind: "fixationEnd",
      propertyId: r.propertyId,
      amount: r.balance,
    }));
  const payoffs: FinancingEvent[] = fx.loans.flatMap((l) =>
    l.payoffDate
      ? [
          {
            date: l.payoffDate,
            kind: "loanPayoff" as const,
            propertyId: l.propertyId,
          },
        ]
      : [],
  );
  return [
    ...resets,
    ...payoffs,
    ...completions(portfolio, fx),
    ...leaseEnds(portfolio, fx.asOf),
  ]
    .filter((e) => inWindow(e.date, fx.asOf, months))
    .sort(
      (a, b) =>
        a.date.getTime() - b.date.getTime() ||
        KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
        a.propertyId.localeCompare(b.propertyId),
    );
}
