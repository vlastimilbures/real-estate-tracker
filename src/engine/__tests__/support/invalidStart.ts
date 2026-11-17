// Invalid dates that once sent a payment-grid walk into an endless loop (ADR 0247, #543):
// a mortgage block whose start date is invalid, with each event and draw shape on it, and
// an invalid as-of date. Shared by validate-invalid-start.test.ts and the child process it
// runs each case in first, so a case that never returns cannot hang the suite.
import { isoDate, lastGridMonthOnOrBefore } from "../../dates";
import { money } from "../../brands";
import { EngineInputError } from "../../errors";
import { portfolioOutputs } from "../../outputs";
import { portfolioSnapshot } from "../../metrics";
import { cpiAt } from "../../real";
import type { MortgageBlockFields, Portfolio } from "../../types";
import {
  assertLoanInputs,
  assertLoanRows,
  validateInputs,
  type EngineValidationError,
} from "../../validate";
import { assumptions, portfolio } from "./seed";
import { withLoan } from "./loan";

/** An Invalid Date, as a restore can hand the engine one. */
const BAD = isoDate("invalid");
const D = isoDate;

/** The fields each case puts on the loan, on top of an invalid start date. */
const SHAPES = {
  // The issue's repro: a recast to a valid maturity, on a valid date.
  recastMaturity: {
    recasts: [{ date: D("2030-02-01"), maturity: D("2060-01-01") }],
  },
  recastMaturityLoanTerm: {
    loanTermYears: 30,
    recasts: [{ date: D("2030-02-01"), maturity: D("2190-01-01") }],
  },
  recastBadMaturity: {
    recasts: [{ date: D("2030-02-01"), maturity: BAD }],
  },
  recastBadDate: {
    recasts: [{ date: BAD, maturity: D("2060-01-01") }],
  },
  recastInstalment: {
    recasts: [{ date: D("2030-02-01"), instalment: money("0") }],
  },
  prepayment: {
    prepayments: [
      { date: D("2030-02-01"), amount: money("-1"), effect: "shortenTerm" },
      { date: D("2010-01-01"), amount: money("1000"), effect: "shortenTerm" },
      { date: BAD, amount: money("1000"), effect: "lowerInstalment" },
    ],
  },
  devLoanDraws: {
    loanTermYears: 20,
    completionDate: D("2020-06-30"),
    draws: [
      { date: D("2010-06-01"), amount: money("100000") },
      { date: D("2060-01-01"), amount: money("0") },
      { date: BAD, amount: money("1") },
    ],
  },
  devLoanRecast: {
    loanTermYears: 20,
    completionDate: D("2022-06-30"),
    draws: [{ date: D("2021-06-01"), amount: money("100000") }],
    recasts: [
      { date: D("2021-02-01"), maturity: D("2021-03-01") },
      { date: D("2022-02-01"), instalment: money("9000") },
    ],
  },
  fixation: { fixationYears: 2.5 },
  loanTerm: { loanTermYears: 0 },
  contractMaturity: { contractMaturityDate: D("2050-01-17") },
  everyEvent: {
    loanTermYears: 25,
    contractMaturityDate: D("2046-01-17"),
    prepayments: [
      { date: D("2030-02-01"), amount: money("1000"), effect: "shortenTerm" },
    ],
    recasts: [
      { date: D("2031-02-01"), instalment: money("9000") },
      { date: D("2032-02-01"), maturity: D("2040-01-01") },
      { date: D("2033-02-01"), maturity: D("2190-01-01") },
    ],
  },
} satisfies Record<string, Partial<MortgageBlockFields>>;

export type InvalidStartCase = keyof typeof SHAPES;

/** The seed portfolio with one loan "m-x" whose start date is invalid. */
const invalidStartPortfolio = (name: InvalidStartCase): Portfolio =>
  withLoan({ startDate: BAD, ...SHAPES[name] });

/** What a call came to: the errors it returned or raised, "returned" for an assert that
 *  raised nothing, or the name and message of any other error. */
type Outcome = readonly EngineValidationError[] | string;

function outcome(f: () => unknown): Outcome {
  try {
    const r = f();
    return Array.isArray(r) ? (r as EngineValidationError[]) : "returned";
  } catch (e) {
    if (e instanceof EngineInputError) return e.errors;
    return e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  }
}

/** The validators and the app's entry point on one invalid-start case. */
export function invalidStartOutcomes(name: InvalidStartCase) {
  const p = invalidStartPortfolio(name);
  const [block] = p.mortgages;
  if (!block) throw new Error("no loan");
  return {
    validateInputs: outcome(() => validateInputs(p, assumptions)),
    assertLoanInputs: outcome(() => assertLoanInputs(block)),
    assertLoanRows: outcome(() => assertLoanRows([block])),
    portfolioOutputs: outcome(() => portfolioOutputs(p, assumptions)),
  };
}

/** The grid walk and the as-of entry points on an invalid date. */
const GRID = {
  lastGridInvalidAnchor: () =>
    lastGridMonthOnOrBefore(BAD, assumptions.baseDate),
  lastGridInvalidDate: () => lastGridMonthOnOrBefore(assumptions.baseDate, BAD),
  portfolioOutputsAsOf: () => portfolioOutputs(portfolio, assumptions, BAD),
  portfolioSnapshotAsOf: () => portfolioSnapshot(portfolio, assumptions, BAD),
  cpiAtAsOf: () => cpiAt(assumptions, BAD),
};

export type GridCase = keyof typeof GRID;

export const gridOutcome = (name: GridCase): Outcome => outcome(GRID[name]);
