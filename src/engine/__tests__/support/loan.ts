// A plain Javorova-like loan for the validation suites: id "m-x", start 2021-01-17,
// NPER term 364 payments (last payment 2051-05-17). Override any field per test.
import { isoDate } from "../../dates";
import { money, rate } from "../../brands";
import type { EngineValidationError } from "../../validate";
import type {
  MortgageBlock,
  MortgageBlockFields,
  Portfolio,
} from "../../types";
import { portfolio } from "./seed";

export const loan = (b: Partial<MortgageBlockFields>): MortgageBlock =>
  ({
    id: "m-x",
    propertyId: "javorova",
    startDate: isoDate("2021-01-17"),
    initialPrincipal: money("1912500"),
    fixationYears: 10,
    interestRatePa: rate("0.0169"),
    monthlyInstalment: money("6721.8"),
    ...b,
  }) as MortgageBlock;

/** The seed portfolio with `loan(b)` as its only mortgage. */
export const withLoan = (b: Partial<MortgageBlockFields>): Portfolio => ({
  ...portfolio,
  mortgages: [loan(b)],
});

/** A problem reported on `loan`, with its list index when it has one. */
export const onLoan = (
  code: EngineValidationError["code"],
  field: string,
  index?: number,
): EngineValidationError => ({
  code,
  entity: "mortgage",
  id: "m-x",
  field,
  ...(index === undefined ? {} : { index }),
});
