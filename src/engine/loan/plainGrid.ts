// The plain-loan grid: the single-draw schedule (the parity path).
import { ZERO, type Decimal } from "../../lib/money";
import { isAfter } from "../dates";
import { scheduleMonths } from "../amortization";
import type { Assumptions, PlainLoan } from "../types";
import { paymentOffset } from "./calendar";
import { initialTerms, loanEvents } from "./events";
import { type LoanState, type Run, stepMonth } from "./pay";
import { type Opening, plainOpening } from "./opening";
import {
  type BlockSchedule,
  builtMonths,
  trimRepaid,
  quietFrom,
  runGrid,
} from "./grid";

/**
 * The single-draw schedule (the parity path). Opens at the baseDate balance (see
 * `plainOpening`), or draws a future loan on its grid month, and re-amortizes over the
 * constant-maturity remaining term whenever the rate changes — at fixation end and
 * when a scenario rate shock reverts. Once repaid it emits zero rows (payoff guard).
 */
export function buildPlainSchedule(
  block: PlainLoan,
  assumptions: Assumptions,
): BlockSchedule {
  const { baseDate } = assumptions;
  const offset = paymentOffset(block, baseDate);
  const run: Run = {
    block,
    assumptions,
    events: loanEvents(block, assumptions, (d) => isAfter(d, baseDate)),
    offset,
    drawsByMonth: new Map<number, Decimal>(),
    newDebtByMonth: new Map<number, Decimal>(),
    openingCounted: ZERO,
    sizeFirst: null,
    replay: false,
  };
  const opening: Opening & { prevRate: Decimal } = isAfter(
    block.startDate,
    baseDate,
  )
    ? {
        balance: ZERO,
        currentInstalment: block.monthlyInstalment,
        terms: initialTerms(block),
        outcomes: [],
        prevRate: block.interestRatePa,
      }
    : plainOpening(block, assumptions, offset);
  const state: LoanState = {
    balance: opening.balance,
    currentInstalment: opening.currentInstalment,
    drawn: !isAfter(block.startDate, baseDate),
    prevRate: opening.prevRate,
    prevInterestOnly: false,
    terms: opening.terms,
  };
  const contract = scheduleMonths(block, assumptions);
  const grid = runGrid(
    state,
    builtMonths(block, assumptions, offset),
    quietFrom(contract, run.events, offset, []),
    (s, m) => stepMonth(s, m, run),
  );
  return {
    rows: trimRepaid(grid.rows, contract),
    outcomes: [...opening.outcomes, ...grid.outcomes],
  };
}
