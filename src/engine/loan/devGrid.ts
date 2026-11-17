// The development-loan grid (D-24, D-41, D-44).
import { ZERO, type Decimal } from "../../lib/money";
import { isAfter } from "../dates";
import {
  dueDate,
  instalmentFor,
  scheduledInstalment,
  scheduleMonths,
} from "../amortization";
import type { Assumptions, DevelopmentLoan } from "../types";
import {
  paymentOffset,
  lastPaymentDue,
  rateOfPayment,
  interestOnlyAt,
  bucketDraws,
} from "./calendar";
import { initialTerms, loanEvents, type Outcome } from "./events";
import { type LoanState, type Run, stepMonth } from "./pay";
import { simulateToBaseDate } from "./opening";
import {
  type BlockSchedule,
  builtMonths,
  trimRepaid,
  quietFrom,
  runGrid,
} from "./grid";

function initDevScheduleState(
  block: DevelopmentLoan,
  assumptions: Assumptions,
): { state: LoanState; outcomes: Outcome[]; counted: Decimal } {
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
  const run: Run = {
    block,
    assumptions,
    events: loanEvents(block, assumptions, (d) => isAfter(d, baseDate)),
    offset: startToBase,
    drawsByMonth: bucketDraws(block.draws ?? [], baseDate, (d) =>
      isAfter(d, drawnAfter),
    ),
    newDebtByMonth: bucketDraws(block.draws ?? [], baseDate, (d) =>
      isAfter(d, baseDate),
    ),
    openingCounted: opening.counted,
    // The first draw's instalment: its amount over the full term (D-46, DR-122).
    sizeFirst: (balance) =>
      instalmentFor(balance, block.interestRatePa, block.loanTermYears),
    replay: false,
  };
  const contract = scheduleMonths(block, assumptions);
  const quiet = quietFrom(
    contract,
    run.events,
    startToBase,
    run.drawsByMonth.keys(),
  );
  const grid = runGrid(opening.state, totalMonths, quiet, (s, m) =>
    stepMonth(s, m, run),
  );
  return {
    rows: trimRepaid(grid.rows, contract),
    outcomes: [...opening.outcomes, ...grid.outcomes],
  };
}
