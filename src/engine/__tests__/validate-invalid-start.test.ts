// An invalid date never sends a payment-grid walk into an endless loop (ADR 0247, #543).
// A synchronous endless loop cannot be timed out inside a test, so each case runs first in
// a child process killed after CHILD_MS; only a case that returned there runs in-process.
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  DATA_ERROR_CODES,
  LOAN_ERROR_CODES,
  type EngineValidationError,
  type ValidationCode,
} from "../validate/codes";
import { onLoan } from "./support/loan";
import {
  gridOutcome,
  invalidStartOutcomes,
  type GridCase,
  type InvalidStartCase,
} from "./support/invalidStart";

const SUPPORT = new URL("./support/invalidStart.ts", import.meta.url).href;
const CHILD_MS = 1500;
const TIMEOUT = { timeout: 2000 };

// The child loads the engine's TypeScript as Node strips it; the hook adds the ".ts" (or
// "/index.ts") the engine's imports leave out.
const CHILD = `
import { registerHooks } from "node:module";
registerHooks({
  resolve(spec, ctx, next) {
    try { return next(spec, ctx); } catch (e) {
      if (!spec.startsWith(".")) throw e;
      for (const ext of [".ts", "/index.ts"]) {
        try { return next(spec + ext, ctx); } catch {}
      }
      throw e;
    }
  },
});
const [url, fn, name] = process.argv.slice(1);
const m = await import(url);
process.stdout.write(JSON.stringify(m[fn](name)));
`;

/** `fn(name)` from the support module, run in a child process that is killed when it
 *  does not return within CHILD_MS. */
function bounded(fn: string, name: string): unknown {
  const r = spawnSync(
    process.execPath,
    ["--input-type=module", "--no-warnings", "-e", CHILD, SUPPORT, fn, name],
    { encoding: "utf8", timeout: CHILD_MS },
  );
  if (r.error || r.signal)
    throw new Error(`${fn}(${name}) did not return within ${CHILD_MS} ms`);
  if (r.status !== 0) throw new Error(r.stderr);
  return JSON.parse(r.stdout);
}

const start = onLoan("INVALID_DATE", "startDate");

/** The errors of `errors` with one of `codes`, as an assert raises them. */
function raised(
  errors: EngineValidationError[],
  codes: ReadonlySet<ValidationCode>,
) {
  const own = errors.filter((e) => codes.has(e.code));
  return own.length > 0 ? own : "returned";
}

/** `validateInputs` reports exactly `errors`; the loan asserts raise their share, and
 *  the app's entry point the data share (assertLoanRows runs first there). */
function expectCase(name: InvalidStartCase, errors: EngineValidationError[]) {
  const expected = {
    validateInputs: errors,
    assertLoanInputs: raised(errors, LOAN_ERROR_CODES),
    assertLoanRows: raised(errors, DATA_ERROR_CODES),
    portfolioOutputs: raised(errors, DATA_ERROR_CODES),
  };
  expect(bounded("invalidStartOutcomes", name)).toEqual(expected);
  expect(invalidStartOutcomes(name)).toEqual(expected);
}

describe("a loan with an invalid start date (ADR 0247)", () => {
  it.fails(
    "#543: a recast to a maturity reports only the start date",
    TIMEOUT,
    () => expectCase("recastMaturity", [start]),
  );

  it.fails(
    "#543: with a loan term, a recast maturity past the cap is not checked",
    TIMEOUT,
    () => expectCase("recastMaturityLoanTerm", [start]),
  );

  it("a recast to an invalid maturity reports that date", TIMEOUT, () =>
    expectCase("recastBadMaturity", [
      start,
      onLoan("INVALID_DATE", "recasts", 0),
    ]),
  );

  it("a recast on an invalid date reports that date", TIMEOUT, () =>
    expectCase("recastBadDate", [start, onLoan("INVALID_DATE", "recasts", 0)]),
  );

  it("a recast instalment is still checked for its amount", TIMEOUT, () =>
    expectCase("recastInstalment", [
      start,
      onLoan("INVALID_RECAST", "recasts", 0),
    ]),
  );

  it(
    "a prepayment is checked for its amount and date, not against the start",
    TIMEOUT,
    () =>
      expectCase("prepayment", [
        start,
        onLoan("NON_POSITIVE_PREPAYMENT", "prepayments", 0),
        onLoan("INVALID_DATE", "prepayments", 2),
      ]),
  );

  it(
    "draws and the completion are not checked against the start",
    TIMEOUT,
    () =>
      expectCase("devLoanDraws", [
        start,
        onLoan("NON_POSITIVE_DRAW", "draws", 1),
        onLoan("INVALID_DATE", "draws", 2),
      ]),
  );

  it.fails(
    "#543: a development loan's recast maturity is not checked",
    TIMEOUT,
    () => expectCase("devLoanRecast", [start]),
  );

  it("the fixation is still checked", TIMEOUT, () =>
    expectCase("fixation", [start, onLoan("INVALID_TERM", "fixationYears")]),
  );

  it("the loan term is still checked", TIMEOUT, () =>
    expectCase("loanTerm", [start, onLoan("INVALID_TERM", "loanTermYears")]),
  );

  it("a contract maturity adds nothing", TIMEOUT, () =>
    expectCase("contractMaturity", [start]),
  );

  it.fails(
    "#543: every event shape at once reports only the start date",
    TIMEOUT,
    () => expectCase("everyEvent", [start]),
  );
});

/** The walk refuses an invalid date: a caller bug, as an as-of past the horizon is
 *  (ADR 0150). */
const INVALID = "RangeError: lastGridMonthOnOrBefore: an invalid date";

describe("the payment-grid walk on an invalid date (ADR 0247)", () => {
  const cases: GridCase[] = [
    "lastGridInvalidAnchor",
    "lastGridInvalidDate",
    "portfolioOutputsAsOf",
    "portfolioSnapshotAsOf",
    "cpiAtAsOf",
  ];
  for (const name of cases)
    it.fails(`#543: ${name} raises instead of looping`, TIMEOUT, () => {
      expect(bounded("gridOutcome", name)).toBe(INVALID);
      expect(gridOutcome(name)).toBe(INVALID);
    });
});
