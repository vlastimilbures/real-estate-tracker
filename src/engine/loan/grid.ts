// One block's schedule on the baseDate grid: its opening state and its run (ADR 0109).
import { ZERO, type Decimal } from "../../lib/money";
import { isAfter } from "../dates";
import {
  dueDate,
  eventTermMonths,
  scheduleMonths,
  termMonths,
} from "../loanTerm";
import { instalmentFor, scheduledInstalment } from "../loanInstalment";
import { isDevLoan } from "../loanBlock";
import type { AmortizationRow, Assumptions, MortgageBlock } from "../types";
import {
  paymentOffset,
  lastPaymentDue,
  rateOfPayment,
  interestOnlyAt,
  bucketDraws,
} from "./calendar";
import { initialTerms, loanEvents, type Outcome } from "./events";
import { type LoanState, type Run, owes, stepMonth } from "./pay";
import { plainOpening, simulateToBaseDate } from "./opening";

/** A block's rows and what its prepayments and recasts did (ADR 0109). */
export interface BlockSchedule {
  rows: AmortizationRow[];
  outcomes: Outcome[];
}

/** How far a block's grid runs: `contract` rows always (`scheduleMonths`); up to
 *  `built`, longer when a recast can run the loan past the contract (ADR 0109); and
 *  every month to `busy`, the last a tranche or an event touches (payment p settles in
 *  grid month p − offset). Grid month m carries payment `offset + m`. */
interface Extent {
  contract: number;
  built: number;
  busy: number;
}

function extent(run: Run): Extent {
  const { block, assumptions, events, offset } = run;
  const contract = scheduleMonths(block, assumptions);
  const built = block.recasts?.length
    ? Math.max(contract, eventTermMonths(block, termMonths(block)) - offset)
    : contract;
  const paymentsAt = [
    ...events.prepaymentsAt.keys(),
    ...events.recastsAt.keys(),
  ];
  const busy = Math.max(
    contract,
    ...paymentsAt.map((p) => p - offset),
    ...run.drawsByMonth.keys(),
  );
  return { contract, built, busy };
}

/** Run the month step over the grid, collecting rows and event outcomes. Past `busy`
 *  the build stops once the loan owes nothing, instead of running to a recast's
 *  50-year reach; past the contract a month that owes nothing has no row (ADR 0109). */
function runGrid(state: LoanState, run: Run): BlockSchedule {
  const { contract, built, busy } = extent(run);
  const owed = (s: LoanState, m: number) =>
    owes(s, run.drawsByMonth.get(m) ?? ZERO);
  const rows: AmortizationRow[] = [];
  const outcomes: Outcome[] = [];
  let s = state;
  for (let m = 1; m <= built && (m <= busy || owed(s, m)); m++) {
    const next = stepMonth(s, m, run);
    if (m <= contract || owed(s, m)) rows.push(next.row);
    outcomes.push(...next.outcomes);
    s = next.state;
  }
  return { rows, outcomes };
}

/**
 * The state a block's grid opens from. A future loan is undrawn, at the instalment
 * it opens with (`scheduledInstalment`, ADR 0031). A running loan opens at its baseDate
 * balance: the catch-up for a development loan, `plainOpening` for a plain one (its
 * payments replayed, ADR 0235), at the rate and interest-only of the last
 * payment made, not baseDate: a completion between the two must still trigger the
 * re-amortization at grid month 1 (ADR 0024, ADR 0116).
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
    : { ...plainOpening(block, assumptions), counted: ZERO };
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
 * interest-only (ADR 0024), and emits zero rows once repaid (payoff guard). A plain loan
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
  // in grid month 1 and re-amortizes there (ADR 0024).
  // A tranche landing in grid month 1 is added before that row's split, so
  // `balanceAtMonth(schedule, 0)` includes it; the baseDate debt (`openingBalance`)
  // counts only the tranches dated on/before baseDate (ADR 0024).
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
    // The first draw's instalment: its amount over the full term (ADR 0024).
    sizeFirst: isDevLoan(block)
      ? (balance) =>
          instalmentFor(balance, block.interestRatePa, block.loanTermYears)
      : null,
    replay: false,
  };
  const grid = runGrid(opening.state, run);
  return {
    rows: grid.rows,
    outcomes: [...opening.outcomes, ...grid.outcomes],
  };
}
