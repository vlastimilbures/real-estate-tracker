// Financing exposure (ADR 0103, #31); the upcoming events built on it are in
// ./upcomingEvents. Read off the same schedules the projection uses, so every balance
// matches the amortization table:
//   • fixation end = blockEndDate; its payment is still fixed (ADR 0021), so the balance at
//     fixation end is the end balance of grid month fixationYears*12 − paymentOffset;
//   • a loan is a property's block chain (ADR 0027), its payoff the schedule's last payment.
// Dates are modelled from the entered data, not lender deadlines (the wording is UI).
import { ZERO, type Decimal } from "../lib/money";
import { blockEndDate } from "./loanRate";
import { withoutPrepayments } from "./loanBlock";
import { selectBlock } from "./loan/blockChain";
import { DEBT_FREE_EPSILON } from "./loanConstants";
import { edate, isAfter, isOnOrBefore } from "./dates";
import {
  afterSuccessor,
  chainLinks,
  type ChainLink,
  hasPayment,
  lastPaymentMonth,
  propertySchedule,
  type PropertySchedule,
  replacedByMonth,
  replacedOnOrBefore,
} from "./schedule";
import { paymentOffset } from "./loan/calendar";
import type {
  AmortizationRow,
  Assumptions,
  IsoDate,
  MortgageBlock,
  Portfolio,
} from "./types";
import { yearsToMonths } from "./units";
import { activeProperties } from "./selectors";

/** One block's fixation end and the debt exposed to the reset after it. */
export interface FixationReset {
  propertyId: string;
  blockId: string;
  fixationEnd: IsoDate;
  /** Grid month of the fixation-end payment (the reset row is the next one). */
  gridMonth: number;
  /** First match wins (ADR 0117): replaced: a successor takes over first · repaid: no
   *  balance left by then · passed: on/before as-of · upcoming: otherwise. */
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
  /** Schedule payments due after as-of (0 once repaid, ADR 0117). */
  remainingMonths: number | null;
  /** Interest the loan's prepayments save to payoff; null unless one repaid some
   *  principal (ADR 0116, ADR 0130). */
  interestSaved: Decimal | null;
}

/** One draw of a development loan as of a date (ADR 0167). */
export interface DrawdownTranche {
  date: IsoDate;
  amount: Decimal;
  /** True for the start draw (the initial principal on the start date). */
  start: boolean;
  /** drawn: dated on/before as-of · ahead: later · cancelled: dated after the next
   *  block's start, so never drawn (ADR 0166). */
  status: "drawn" | "ahead" | "cancelled";
}

/** A development loan's draws as of a date: the start draw first, then each tranche. */
export interface Drawdown {
  blockId: string;
  /** The draws that are drawn or ahead (cancelled ones never count). */
  total: Decimal;
  drawn: Decimal;
  tranches: DrawdownTranche[];
}

/** One property's loan view: its exposure, every chain block's reset, the chain (ADR 0117). */
export interface PropertyLoan {
  loan: LoanExposure;
  /** The chain blocks' fixation ends, as on the Dashboard (none for a floating block). */
  resets: FixationReset[];
  /** Ids of the blocks driving the schedule, in order (ADR 0027). */
  chain: string[];
  /** Each chain block with tranches that no successor has replaced by as-of (ADR 0167). */
  drawdowns: Drawdown[];
}

export interface FinancingExposure {
  asOf: IsoDate;
  loans: LoanExposure[];
  resets: FixationReset[];
}

/** True when `date` is in (asOf, asOf + months]. */
export function inWindow(date: Date, asOf: Date, months: number): boolean {
  return isAfter(date, asOf) && isOnOrBefore(date, edate(asOf, months));
}

/**
 * The status of a fixation end at grid month `m`, before the balance is read. Replaced
 * and repaid outrank passed, so a past fixation end keeps its outcome (ADR 0117). One on
 * or before baseDate (m ≤ 0) has no schedule row: passed unless replaced (ADR 0030).
 */
function resetStatus(
  { fixationEnd, m }: { fixationEnd: Date; m: number },
  link: ChainLink,
  rows: AmortizationRow[],
  ctx: { asOf: Date; baseDate: Date },
): FixationReset["status"] {
  if (
    replacedOnOrBefore(link, fixationEnd) ||
    replacedByMonth(link, m, ctx.baseDate)
  )
    return "replaced";
  if (m <= 0) return "passed";
  const row = rows[m - 1];
  if (!row || row.endBalance.lessThanOrEqualTo(DEBT_FREE_EPSILON))
    return "repaid";
  if (isOnOrBefore(fixationEnd, ctx.asOf)) return "passed";
  return "upcoming";
}

/** Each chain block's fixation end (none for a 0-year, floating block). */
function chainResets(
  links: ChainLink[],
  rows: AmortizationRow[],
  ctx: { asOf: Date; baseDate: Date },
): FixationReset[] {
  const resets: FixationReset[] = [];
  for (const link of links) {
    const { block } = link;
    if (block.fixationYears === 0) continue;
    const fixationEnd = blockEndDate(block);
    const m =
      yearsToMonths(block.fixationYears) - paymentOffset(block, ctx.baseDate);
    const status = resetStatus({ fixationEnd, m }, link, rows, ctx);
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

/**
 * Schedule payments due after `asOf`, each on its paying block's own day (ADR 0117): a
 * paying row's due date is its paying block's (ADR 0164), so the rows' own dates tell.
 */
function paymentsDueAfter(rows: AmortizationRow[], asOf: Date): number {
  return rows.filter(
    (r) => hasPayment(r) && r.dueDate !== null && isAfter(r.dueDate, asOf),
  ).length;
}

const interestOf = (rows: AmortizationRow[]): Decimal =>
  rows.reduce((s, r) => s.plus(r.interest), ZERO);

/** A property's schedule rows and what its prepayments and recasts did (ADR 0109). */
type LoanSchedule = Pick<PropertySchedule, "rows" | "eventOutcomes">;

/**
 * Interest a property's prepayments save over the rest of its loans' life: the chain's
 * interest from grid month 1 to payoff with every prepayment removed (those before
 * baseDate too), minus the same in `schedule`, built with them. Recasts stay (ADR 0116).
 * Null unless a prepayment of the chain repaid some principal (ADR 0130). Negative when
 * a recast applies only with the prepayment; the UI shows a note instead.
 */
export function prepaymentInterestSaved(
  blocks: MortgageBlock[],
  assumptions: Assumptions,
  schedule: LoanSchedule,
): Decimal | null {
  const applied = schedule.eventOutcomes.some(
    (o) => o.kind === "prepayment" && o.applied.greaterThan(ZERO),
  );
  if (!applied) return null;
  const without = blocks.map(withoutPrepayments);
  return interestOf(propertySchedule(without, assumptions).rows).minus(
    interestOf(schedule.rows),
  );
}

/**
 * A development block's draws as of `asOf` (ADR 0167). A draw dated on or before as-of is
 * drawn: the calendar date the owner sees, not the schedule's grid month. A tranche dated
 * after the next block's start is never drawn (`afterSuccessor`, ADR 0166).
 */
function blockDrawdown(
  block: MortgageBlock,
  next: MortgageBlock | undefined,
  asOf: Date,
): Drawdown {
  const draw = (
    date: IsoDate,
    amount: Decimal,
    start: boolean,
  ): DrawdownTranche => ({
    date,
    amount,
    start,
    status:
      !start && afterSuccessor(next, date)
        ? "cancelled"
        : isOnOrBefore(date, asOf)
          ? "drawn"
          : "ahead",
  });
  const tranches = [
    draw(block.startDate, block.initialPrincipal, true),
    ...[...(block.draws ?? [])]
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map((d) => draw(d.date, d.amount, false)),
  ];
  const sum = (keep: (t: DrawdownTranche) => boolean) =>
    tranches.filter(keep).reduce<Decimal>((s, t) => s.plus(t.amount), ZERO);
  return {
    blockId: block.id,
    total: sum((t) => t.status !== "cancelled"),
    drawn: sum((t) => t.status === "drawn"),
    tranches,
  };
}

/** One property's loan exposure, resets and chain (none without a loan). */
function propertyExposure(
  blocks: MortgageBlock[],
  schedule: LoanSchedule,
  ctx: { asOf: IsoDate; assumptions: Assumptions; baseDate: Date },
): PropertyLoan | null {
  const { rows } = schedule;
  const links = chainLinks(blocks, ctx.baseDate);
  const chain = links.map((l) => l.block);
  const first = chain[0];
  if (!first) return null;
  const resets = chainResets(links, rows, ctx);
  const last = lastPaymentMonth(rows);
  return {
    loan: {
      propertyId: first.propertyId,
      blockId: (selectBlock(chain, ctx.asOf) ?? first).id,
      nextFixation: resets.find((r) => r.status === "upcoming") ?? null,
      payoffDate: rows[last - 1]?.dueDate ?? null, // ADR 0164
      remainingMonths: last > 0 ? paymentsDueAfter(rows, ctx.asOf) : null,
      interestSaved: prepaymentInterestSaved(blocks, ctx.assumptions, schedule),
    },
    resets,
    chain: chain.map((b) => b.id),
    // A block with tranches, until a successor is in force at as-of (ADR 0167).
    drawdowns: links.flatMap((link) =>
      link.block.draws?.length && !replacedOnOrBefore(link, ctx.asOf)
        ? [blockDrawdown(link.block, link.next, ctx.asOf)]
        : [],
    ),
  };
}

/**
 * One property's loan as of `asOf` from its blocks and schedule, active or not:
 * the property page's view of its `financingExposure` entry with its resets and chain
 * (ADR 0116, ADR 0117). Null without a loan.
 */
export function propertyLoanExposure(
  blocks: MortgageBlock[],
  assumptions: Assumptions,
  schedule: LoanSchedule,
  asOf: IsoDate,
): PropertyLoan | null {
  const ctx = { asOf, assumptions, baseDate: assumptions.baseDate };
  return propertyExposure(blocks, schedule, ctx);
}

/**
 * Each active property's loan as of `asOf` (next fixation, modelled payoff, remaining
 * term) and every chain block's fixation end, from `schedules` (built from the same
 * portfolio and assumptions). Pure; `asOf` is explicit (ADR 0103).
 */
export function financingExposure(
  portfolio: Portfolio,
  assumptions: Assumptions,
  schedules: Map<string, LoanSchedule>,
  asOf: IsoDate,
): FinancingExposure {
  const ctx = { asOf, assumptions, baseDate: assumptions.baseDate };
  const loans: LoanExposure[] = [];
  const resets: FixationReset[] = [];
  const active = activeProperties(portfolio.properties);
  for (const id of new Set(active.map((p) => p.id))) {
    const blocks = portfolio.mortgages.filter((b) => b.propertyId === id);
    const one = propertyExposure(
      blocks,
      schedules.get(id) ?? { rows: [], eventOutcomes: [] },
      ctx,
    );
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
      r.status === "upcoming" &&
      inWindow(r.fixationEnd, fx.asOf, yearsToMonths(years)),
  );
  return {
    amount: hit.reduce((s, r) => s.plus(r.balance), ZERO),
    loans: hit.length,
  };
}
