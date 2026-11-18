// One mortgage block's checks (D-17, D-36, D-37) and the loan asserts: the one path into
// checkMortgage.
import { derivedTermProblem, dueDate } from "../amortization";
import { isAfter, isOnOrBefore } from "../dates";
import type { MortgageBlock } from "../types";
import {
  DATA_ERROR_CODES,
  raisedByLoanGate,
  type EngineValidationError,
  type FieldOf,
  type ValidationCode,
} from "./codes";
import {
  badDate,
  checkAmount,
  checkFields,
  checkSigns,
  isNegativeAmount,
  notPositive,
  outsideUnit,
  raise,
  rowError,
  type Report,
  type SignRule,
} from "./check";
import { checkLoanEvents } from "./loanEvents";

/** A block's reporter: a problem on a mortgage field. */
export type LoanReport = Report<FieldOf<"mortgage">>;

/** Term problems of a loan whose term comes from its instalment (NPER). */
function checkDerivedTerm(b: MortgageBlock, report: LoanReport): void {
  const problem = derivedTermProblem(b);
  if (problem) report(problem.code, problem.field);
}

/** The due date of payment `term − back` (term = the loan term in payments), or
 *  undefined without a valid term (then MISSING_TERM_FOR_DEV_LOAN or INVALID_TERM
 *  reports instead). */
function paymentFromEnd(b: MortgageBlock, back: number): Date | undefined {
  return b.loanTermYears != null && Number.isInteger(b.loanTermYears)
    ? dueDate(b, b.loanTermYears * 12 - back)
    : undefined;
}

/** The last-but-one payment date (start + term − 1 month). */
const lastDrawDate = (b: MortgageBlock) => paymentFromEnd(b, 1);

/** The last-but-two payment date (start + term − 2 months): the last date a tranche
 *  may have (ADR 0226 §1). */
const lastButTwoDate = (b: MortgageBlock) => paymentFromEnd(b, 2);

/** The last-but-one and last-but-two payment dates a draw is checked against. */
interface DrawLimits {
  lastDraw: Date | undefined;
  lastButTwo: Date | undefined;
}

function checkDrawDate(
  date: Date,
  b: MortgageBlock,
  { lastDraw, lastButTwo }: DrawLimits,
  i: number,
  report: LoanReport,
): void {
  if (badDate(date)) report("INVALID_DATE", "draws", i);
  // A draw on the start date itself belongs in the initial principal (D-42).
  else if (isOnOrBefore(date, b.startDate))
    report("DRAW_BEFORE_START", "draws", i);
  // A later draw lands on the final payment, which would repay it in one shot
  // (DR-074, ADR 0129 §3).
  else if (lastDraw && isAfter(date, lastDraw))
    report("DRAW_AFTER_SCHEDULE_END", "draws", i);
  // A draw in the last two payment months is not modelled (ADR 0226 §1).
  else if (lastButTwo && isAfter(date, lastButTwo))
    report("DRAW_IN_LAST_TWO_PAYMENTS", "draws", i);
}

function checkDevFeatures(b: MortgageBlock, report: LoanReport): void {
  const limits = { lastDraw: lastDrawDate(b), lastButTwo: lastButTwoDate(b) };
  (b.draws ?? []).forEach((d, i) => {
    checkDrawDate(d.date, b, limits, i, report);
    checkAmount(d.amount, notPositive, "NON_POSITIVE_DRAW", (code) =>
      report(code, "draws", i),
    );
  });
  if (b.completionDate && isAfter(b.startDate, b.completionDate)) {
    report("COMPLETION_BEFORE_START", "completionDate");
  }
}

/** Fixation and loan term are whole years (the loan term ADR 0135). */
function checkTerms(b: MortgageBlock, report: LoanReport): void {
  if (!Number.isInteger(b.fixationYears) || b.fixationYears < 0)
    report("INVALID_TERM", "fixationYears");
  if (
    b.loanTermYears != null &&
    !(Number.isInteger(b.loanTermYears) && b.loanTermYears > 0)
  )
    report("INVALID_TERM", "loanTermYears");
}

/** The block's own amounts and rate, in this order. */
const LOAN_SIGNS: readonly SignRule<
  MortgageBlock,
  "initialPrincipal" | "monthlyInstalment" | "interestRatePa"
>[] = [
  ["initialPrincipal", isNegativeAmount, "NEGATIVE_PRINCIPAL"],
  ["monthlyInstalment", isNegativeAmount, "NEGATIVE_AMOUNT"],
  ["interestRatePa", outsideUnit, "RATE_OUT_OF_RANGE"],
];

function checkMortgage(b: MortgageBlock, report: LoanReport): void {
  checkFields(
    b,
    ["startDate", "completionDate", "contractMaturityDate"],
    ["initialPrincipal", "interestRatePa", "monthlyInstalment"],
    report,
  );
  checkSigns(b, LOAN_SIGNS, report);
  checkTerms(b, report);
  checkDevFeatures(b, report);
  if (b.initialPrincipal.isFinite() && b.interestRatePa.isFinite())
    checkDerivedTerm(b, report);
  checkLoanEvents(b, report);
}

/** A problem as a check reports it: the code, the field, the list index. */
type Issue = Parameters<LoanReport>;

/** Every problem of one block, in check order: the one way into checkMortgage. */
export function blockIssues(b: MortgageBlock): Issue[] {
  const issues: Issue[] = [];
  checkMortgage(b, (...issue) => {
    issues.push(issue);
  });
  return issues;
}

/** The block's problems a gate raises, as errors on the block. */
function blockErrors(
  b: MortgageBlock,
  raised: (code: ValidationCode, field: string | undefined) => boolean,
): EngineValidationError[] {
  return blockIssues(b)
    .filter(([code, field]) => raised(code, field))
    .map(([code, field, index]) =>
      rowError("mortgage", b.id, code, field, index),
    );
}

/**
 * Raise an EngineInputError when a loan the engine is about to compute has a D-17
 * problem, instead of letting it become a NaN term, an endless schedule or vanished
 * debt (DR-014, DR-018, DR-043). Every D-17 problem of the block is listed, and a
 * non-finite principal or instalment (ADR 0251 §2).
 */
export function assertLoanInputs(block: MortgageBlock): void {
  raise(blockErrors(block, raisedByLoanGate));
}

/**
 * Raise the D-37 data problems of every block of a property, before the block chain
 * is chosen (a block with an invalid start date would otherwise just drop out).
 */
export function assertLoanRows(blocks: MortgageBlock[]): void {
  const errors: EngineValidationError[] = [];
  for (const b of blocks)
    errors.push(...blockErrors(b, (code) => DATA_ERROR_CODES.has(code)));
  raise(errors);
}
