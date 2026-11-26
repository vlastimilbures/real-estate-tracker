// The entry points' validators: everything in a stable order, and the asserts on the
// data and range codes (ADR 0019, ADR 0037, ADR 0038).
import { isAfter } from "../dates";
import { EngineInputError } from "../errors";
import type { Assumptions, Portfolio } from "../types";
import { ENTRY_ERROR_CODES, type EngineValidationError } from "./codes";
import { assumptionError, assumptionReporter } from "./check";
import { checkAssumptions } from "./assumptions";
import { checkPortfolio } from "./rows";

// Known gap: an object spread keeps the brand, so `{ ...v.assumptions, horizonYears: -5 }`
// still type-checks as ValidAssumptions and `{ ...v, portfolio: q }` as ValidInputs. Use
// the asserts' results as they are: never spread or rebuild a branded value (the engine
// composes them, e.g. `EngineRun` holds `inputs`). A lint ban would need type
// information the syntax rules do not have.
declare const validBrand: unique symbol;

/** Assumptions `assertAssumptions` (or `assertInputs`) raised nothing on. A compile-time
 *  tag only: the same object, so branding never changes a computed number (ADR 0074). */
export type ValidAssumptions = Assumptions & { readonly [validBrand]: true };

/** Inputs `assertInputs` raised nothing on. The engine's internal halves take only this,
 *  so a public entry point cannot reach them without validating first. */
export interface ValidInputs {
  readonly portfolio: Portfolio;
  readonly assumptions: ValidAssumptions;
  readonly [validBrand]: true;
}

/** ASOF_BEFORE_BASEDATE when `asOf` precedes the projection window start (ADR 0019). */
function asOfProblem(
  asOf: Date,
  baseDate: Date,
): EngineValidationError | undefined {
  return isAfter(baseDate, asOf)
    ? assumptionError("ASOF_BEFORE_BASEDATE", "asOf")
    : undefined;
}

/** Raise ASOF_BEFORE_BASEDATE for an as-of date before baseDate (ADR 0019). */
export function assertAsOf(asOf: Date, baseDate: Date): void {
  const problem = asOfProblem(asOf, baseDate);
  if (problem) throw new EngineInputError([problem]);
}

/**
 * Every problem in the engine inputs, in a stable order (assumptions, then each
 * portfolio collection in input order). Empty when the inputs are valid. `asOf`, when
 * given, is checked against the projection window start (ADR 0019).
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

/** Raise the ADR 0037 / ADR 0038 problems of the assumptions (entry points without a
 *  portfolio); otherwise return them branded valid. */
export function assertAssumptions(assumptions: Assumptions): ValidAssumptions {
  const errors: EngineValidationError[] = [];
  checkAssumptions(
    assumptions,
    assumptionReporter((e) => errors.push(e)),
  );
  raiseEntryErrors(errors);
  // eslint-disable-next-line no-restricted-syntax -- the sanctioned ValidAssumptions constructor
  return assumptions as ValidAssumptions;
}

/**
 * Raise an EngineInputError listing every ADR 0037 / ADR 0038 problem in the inputs
 * (validateInputs order), instead of computing NaN, a rolled-over date or a silent
 * first-row pick; otherwise return them as `ValidInputs` (the assumptions checked as
 * `assertAssumptions` checks them, the portfolio as well).
 */
export function assertInputs(
  portfolio: Portfolio,
  assumptions: Assumptions,
): ValidInputs {
  raiseEntryErrors(validateInputs(portfolio, assumptions));
  // eslint-disable-next-line no-restricted-syntax -- the sanctioned ValidInputs constructor
  return { portfolio, assumptions } as ValidInputs;
}
