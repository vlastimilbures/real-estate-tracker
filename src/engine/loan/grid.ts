// One block's schedule on the baseDate grid: its opening state and its run (ADR 0109).
import { ZERO, type Decimal } from "../../lib/money";
import { isAfter } from "../dates";
import {
  dueDate,
  eventTermMonths,
  instalmentFor,
  isDevLoan,
  scheduledInstalment,
  scheduleMonths,
  termMonths,
} from "../amortization";
import { at } from "../arrays";
import type { AmortizationRow, Assumptions, MortgageBlock } from "../types";
import {
  paymentOffset,
  lastPaymentDue,
  rateOfPayment,
  interestOnlyAt,
  bucketDraws,
} from "./calendar";
import {
  initialTerms,
  type LoanEvents,
  loanEvents,
  type Outcome,
} from "./events";
import { type LoanState, type Run, stepMonth } from "./pay";
import { plainOpening, simulateToBaseDate } from "./opening";

/** A block's rows and what its prepayments and recasts did (ADR 0109). */
export interface BlockSchedule {
  rows: AmortizationRow[];
  outcomes: Outcome[];
}

/**
 * Rows to build: the contract schedule (`scheduleMonths`), or longer when a recast
 * can run the loan past it (ADR 0109). Grid month m carries payment `offset + m`.
 */
function builtMonths(
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
function trimRepaid(
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
function quietFrom(
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

/** Run the month step over the built grid, collecting rows and event outcomes, until
 *  `months` or the first idle row from month `quiet`. */
function runGrid(
  state: LoanState,
  months: number,
  quiet: number,
  run: Run,
): BlockSchedule {
  const rows: AmortizationRow[] = [];
  const outcomes: Outcome[] = [];
  let s = state;
  for (let m = 1; m <= months; m++) {
    const next = stepMonth(s, m, run);
    rows.push(next.row);
    outcomes.push(...next.outcomes);
    s = next.state;
    if (m >= quiet && idleRow(next.row)) break;
  }
  return { rows, outcomes };
}

/**
 * The state a block's grid opens from. A future loan is undrawn, at the instalment
 * it opens with (`scheduledInstalment`, D-31). A running loan opens at its baseDate
 * balance: the catch-up for a development loan, `plainOpening` for a plain one (the
 * closed form, or the replay, D-30), at the rate and interest-only of the last
 * payment made, not baseDate: a completion between the two must still trigger the
 * re-amortization at grid month 1 (D-24, ADR 0116).
 */
function openingState(
  block: MortgageBlock,
  assumptions: Assumptions,
  offset: number,
): { state: LoanState; outcomes: Outcome[]; counted: Decimal } {
  if (isAfter(block.startDate, assumptions.baseDate)) {
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
  const sim = isDevLoan(block)
    ? simulateToBaseDate(block, assumptions)
    : { ...plainOpening(block, assumptions, offset), counted: ZERO };
  return {
    state: {
      balance: sim.balance,
      currentInstalment: sim.currentInstalment,
      drawn: true,
      prevRate: rateOfPayment(offset, block, assumptions),
      prevInterestOnly: interestOnlyAt(block, dueDate(block, offset)),
      terms: sim.terms,
    },
    outcomes: sim.outcomes,
    counted: sim.counted,
  };
}

/**
 * One block's schedule from baseDate: undrawn → draw → interest-only → amortizing →
 * repaid. It re-amortizes over the constant-maturity remaining term on a rate change
 * (fixation end, a scenario rate shock reverting), a tranche landing or the end of
 * interest-only (D-24), and emits zero rows once repaid (payoff guard). A plain loan
 * has no tranches and no interest-only months and keeps its entered instalment.
 */
export function buildBlockSchedule(
  block: MortgageBlock,
  assumptions: Assumptions,
): BlockSchedule {
  const { baseDate } = assumptions;
  const offset = paymentOffset(block, baseDate);
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
  const opening = openingState(block, assumptions, offset);
  const run: Run = {
    block,
    assumptions,
    events: loanEvents(block, assumptions, (d) => isAfter(d, baseDate)),
    offset,
    drawsByMonth: bucketDraws(block.draws ?? [], baseDate, (d) =>
      isAfter(d, drawnAfter),
    ),
    newDebtByMonth: bucketDraws(block.draws ?? [], baseDate, (d) =>
      isAfter(d, baseDate),
    ),
    openingCounted: opening.counted,
    // The first draw's instalment: its amount over the full term (D-46, DR-122).
    sizeFirst: isDevLoan(block)
      ? (balance) =>
          instalmentFor(balance, block.interestRatePa, block.loanTermYears)
      : null,
    replay: false,
  };
  const contract = scheduleMonths(block, assumptions);
  const quiet = quietFrom(
    contract,
    run.events,
    offset,
    run.drawsByMonth.keys(),
  );
  const grid = runGrid(
    opening.state,
    builtMonths(block, assumptions, offset),
    quiet,
    run,
  );
  return {
    rows: trimRepaid(grid.rows, contract),
    outcomes: [...opening.outcomes, ...grid.outcomes],
  };
}
