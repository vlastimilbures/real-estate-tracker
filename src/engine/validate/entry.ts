// The entry points' validators: everything in a stable order, and the asserts on the
// data and range codes (D-19, D-37, D-38).
import { isAfter } from "../dates";
import { EngineInputError } from "../errors";
import type { Assumptions, Portfolio } from "../types";
import { ENTRY_ERROR_CODES, type EngineValidationError } from "./codes";
import { assumptionError, assumptionReporter } from "./check";
import { checkAssumptions } from "./assumptions";
import { checkPortfolio } from "./rows";

/** ASOF_BEFORE_BASEDATE when `asOf` precedes the projection window start (D-19). */
function asOfProblem(
  asOf: Date,
  baseDate: Date,
): EngineValidationError | undefined {
  return isAfter(baseDate, asOf)
    ? assumptionError("ASOF_BEFORE_BASEDATE", "asOf")
    : undefined;
}

/** Raise ASOF_BEFORE_BASEDATE for an as-of date before baseDate (D-19, DR-015). */
export function assertAsOf(asOf: Date, baseDate: Date): void {
  const problem = asOfProblem(asOf, baseDate);
  if (problem) throw new EngineInputError([problem]);
}

/**
 * Every problem in the engine inputs, in a stable order (assumptions, then each
 * portfolio collection in input order). Empty when the inputs are valid. `asOf`, when
 * given, is checked against the projection window start (D-19).
 */
export function validateInputs(
  portfolio: Portfolio,
  assumptions: Assumptions,
  asOf?: Date,
): EngineValidationError[] {
  const errors: EngineValidationError[] = [];
  const add = (e: EngineValidationError) => errors.push(e);
  checkAssumptions(assumptions, assumptionReporter(add));
  const asOfError = asOf && asOfProblem(asOf, assumptions.baseDate);
  if (asOfError) add(asOfError);
  checkPortfolio(portfolio, add);
  return errors;
}

function raiseEntryErrors(errors: EngineValidationError[]): void {
  const raised = errors.filter((e) => ENTRY_ERROR_CODES.has(e.code));
  if (raised.length > 0) throw new EngineInputError(raised);
}

/** Raise the D-37 / D-38 problems of the assumptions (entry points without a portfolio). */
export function assertAssumptions(assumptions: Assumptions): void {
  const errors: EngineValidationError[] = [];
  checkAssumptions(
    assumptions,
    assumptionReporter((e) => errors.push(e)),
  );
  raiseEntryErrors(errors);
}

/**
 * Raise an EngineInputError listing every D-37 / D-38 problem in the inputs (validateInputs
 * order), instead of computing NaN, a rolled-over date or a silent first-row pick.
 */
export function assertInputs(
  portfolio: Portfolio,
  assumptions: Assumptions,
): void {
  raiseEntryErrors(validateInputs(portfolio, assumptions));
}
