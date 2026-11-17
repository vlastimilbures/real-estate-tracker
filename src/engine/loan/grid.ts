// The baseDate grid both schedule loops run on (ADR 0109).
import { ZERO, type Decimal } from "../../lib/money";
import { eventTermMonths, scheduleMonths, termMonths } from "../amortization";
import { at } from "../arrays";
import type { AmortizationRow, Assumptions, MortgageBlock } from "../types";
import {
  type TermState,
  type LoanEvents,
  eventsAt,
  type Outcome,
  settleEvents,
} from "./events";

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

/** A block's rows and what its prepayments and recasts did (ADR 0109). */
export interface BlockSchedule {
  rows: AmortizationRow[];
  outcomes: Outcome[];
}

/**
 * Rows to build: the contract schedule (`scheduleMonths`), or longer when a recast
 * can run the loan past it (ADR 0109). Grid month m carries payment `offset + m`.
 */
export function builtMonths(
  block: MortgageBlock,
  assumptions: Assumptions,
  offset: number,
): number {
  const contract = scheduleMonths(block, assumptions);
  if (!block.recasts?.length) return contract;
  const reach = eventTermMonths(block, termMonths(block)) - offset;
  return Math.max(contract, reach);
}

/** A row that owes and pays nothing. */
const idleRow = (r: AmortizationRow): boolean =>
  !r.endBalance.greaterThan(ZERO) &&
  r.interest.plus(r.principal).plus(r.prepaid).isZero();

/** Drop the zero rows a longer build left past both the contract schedule and the
 *  loan's last payment (ADR 0109). */
export function trimRepaid(
  rows: AmortizationRow[],
  contractMonths: number,
): AmortizationRow[] {
  let n = rows.length;
  while (n > contractMonths && idleRow(at(rows, n - 1))) n--;
  return n === rows.length ? rows : rows.slice(0, n);
}

/**
 * The grid month from which an idle row means the loan stays idle: past the contract
 * schedule and every grid month a tranche (`drawMonths`) or an event (payment p
 * settles in grid month p − offset) touches. The build stops there instead of running
 * to a recast's 50-year reach; `trimRepaid` would drop the rest anyway.
 */
export function quietFrom(
  contractMonths: number,
  events: LoanEvents,
  offset: number,
  drawMonths: Iterable<number>,
): number {
  const paymentsAt = [
    ...events.prepaymentsAt.keys(),
    ...events.recastsAt.keys(),
  ];
  return Math.max(
    contractMonths,
    ...paymentsAt.map((p) => p - offset),
    ...drawMonths,
  );
}

/** Run a month step over the built grid, collecting rows and event outcomes, until
 *  `months` or the first idle row from month `quiet`. */
export function runGrid<S>(
  state: S,
  months: number,
  quiet: number,
  step: (
    s: S,
    m: number,
  ) => { row: AmortizationRow; state: S; outcomes: Outcome[] },
): BlockSchedule {
  const rows: AmortizationRow[] = [];
  const outcomes: Outcome[] = [];
  let s = state;
  for (let m = 1; m <= months; m++) {
    const next = step(s, m);
    rows.push(next.row);
    outcomes.push(...next.outcomes);
    s = next.state;
    if (m >= quiet && idleRow(next.row)) break;
  }
  return { rows, outcomes };
}
