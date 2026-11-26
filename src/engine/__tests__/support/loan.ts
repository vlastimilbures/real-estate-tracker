// The loan builders for tests: `loan`, a plain Javorova-like loan (id "m-x", start
// 2021-01-17, NPER term 364 payments, last payment 2051-05-17), and the presets several
// test files share. Every one is built through the engine's `mortgageBlock`, so no test
// casts a loan; override any field per test.
import { isoDate } from "../../dates";
import { money, rate } from "../../brands";
import type { EngineValidationError } from "../../validate";
import type {
  MortgageBlock,
  MortgageBlockFields,
  Portfolio,
} from "../../types";
import { portfolio } from "./seed";
import { mortgageBlock } from "../../loanBlock";

type Fields = Partial<MortgageBlockFields>;
type With<K extends keyof MortgageBlockFields> = Fields &
  Pick<MortgageBlockFields, K>;

export const loan = (b: Fields): MortgageBlock =>
  mortgageBlock({
    id: "m-x",
    propertyId: "javorova",
    startDate: isoDate("2021-01-17"),
    initialPrincipal: money("1912500"),
    fixationYears: 10,
    interestRatePa: rate("0.0169"),
    monthlyInstalment: money("6721.8"),
    ...b,
  });

/** The seed portfolio with `loan(b)` as its only mortgage. */
export const withLoan = (b: Fields): Portfolio => ({
  ...portfolio,
  mortgages: [loan(b)],
});

/** A problem reported on `loan`, with its list index when it has one. */
export const onLoan = (
  code: EngineValidationError["code"],
  field: NonNullable<EngineValidationError["field"]>,
  index?: number,
): EngineValidationError => ({
  code,
  entity: "mortgage",
  id: "m-x",
  field,
  ...(index === undefined ? {} : { index }),
});

/** A 3 M Kč, 4 % loan with a 30-year term and a 15 000 Kč instalment, on property
 *  "p1": the rate-shock reach suites. */
export const shockLoan = (
  b: With<"id" | "startDate" | "fixationYears">,
): MortgageBlock =>
  mortgageBlock({
    propertyId: "p1",
    initialPrincipal: money("3000000"),
    interestRatePa: rate("0.04"),
    monthlyInstalment: money("15000"),
    loanTermYears: 30,
    ...b,
  });

/** A 3 M Kč, 4 % loan from 2024-01-10 with a 14 322.46 Kč instalment and a 5-year
 *  fixation, on property "p": the financing and loan-outlook suites. */
export const fourPctLoan = (b: With<"id">): MortgageBlock =>
  mortgageBlock({
    propertyId: "p",
    startDate: isoDate("2024-01-10"),
    initialPrincipal: money("3000000"),
    fixationYears: 5,
    interestRatePa: rate("0.04"),
    monthlyInstalment: money("14322.46"),
    ...b,
  });

/** Javorova's refinance: a 5-year, 3.9 % successor block with a 9 800 Kč instalment. */
export const refiLoan = (
  b: With<"startDate" | "initialPrincipal">,
): MortgageBlock =>
  mortgageBlock({
    id: "m-refi",
    propertyId: "javorova",
    fixationYears: 5,
    interestRatePa: rate("0.039"),
    monthlyInstalment: money("9800"),
    ...b,
  });

/** The block the data layer's migration tests store: m1 on p1 from 2024-03-12. */
export const storedLoan: MortgageBlock = mortgageBlock({
  id: "m1",
  propertyId: "p1",
  startDate: isoDate("2024-03-12"),
  initialPrincipal: money("3034500"),
  fixationYears: 7,
  interestRatePa: rate("0.0449"),
  monthlyInstalment: money("21576.4"),
});

/** A future-start construction loan: drawn 2026-09, two tranches, interest-only until
 *  completion 2027-12, then re-amortized over the rest of its 30-year term. */
export const devFuture: MortgageBlock = mortgageBlock({
  id: "dev-future",
  propertyId: "javorova",
  startDate: isoDate("2026-09-01"),
  initialPrincipal: money("2000000"),
  fixationYears: 10,
  interestRatePa: rate("0.05"),
  monthlyInstalment: money("10000"), // ignored while interest-only
  loanTermYears: 30,
  draws: [
    { date: isoDate("2027-03-01"), amount: money("1500000") },
    { date: isoDate("2027-09-01"), amount: money("2000000") },
  ],
  completionDate: isoDate("2027-12-01"),
});

/** The seed's Dubová loan made a development loan: a 30-year term, one 500 000 Kč
 *  tranche on 2024-09-01 and completion on 2025-03-31 (the mortgage form suites). */
export const dubovaDevLoan = (b: Fields = {}): MortgageBlock =>
  mortgageBlock({
    ...portfolio.mortgages.find((m) => m.propertyId === "dubova")!,
    loanTermYears: 30,
    draws: [{ date: isoDate("2024-09-01"), amount: money("500000") }],
    completionDate: isoDate("2025-03-31"),
    ...b,
  });
