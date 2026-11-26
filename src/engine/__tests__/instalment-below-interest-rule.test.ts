// ADR 0264: a plain loan with an explicit term must pay more than its first month's
// interest. `instalmentBelowInterestErrors` is the write-time rule (as LEASE_OVERLAP,
// ADR 0163): the store and the CSV import apply it to the rows they write. Restore and
// the engine's own input checks do not, so a stored loan like that still loads and
// projects as today (owner decision 2, #597; the clamp is debt #611).
import { describe, expect, it } from "vitest";
import { money, rate } from "../brands";
import { isoDate } from "../dates";
import {
  instalmentBelowInterest,
  instalmentBelowInterestErrors,
  validateInputs,
  validatePortfolio,
} from "../validate";
import type { MortgageBlockFields, Portfolio } from "../types";
import { assumptions, portfolio } from "./support/seed";
import { loan, onLoan, withLoan } from "./support/loan";

/** The #597 loan: 3,000,000 Kč at 5 %, a 30-year term, instalment 1,000 Kč. Its first
 *  month's interest is 3,000,000 × 0.05 ÷ 12 = 12,500 Kč. */
const issue597: Partial<MortgageBlockFields> = {
  startDate: isoDate("2026-07-15"),
  initialPrincipal: money("3000000"),
  interestRatePa: rate("0.05"),
  fixationYears: 3,
  loanTermYears: 30,
  monthlyInstalment: money("1000"),
};
const errorsOf = (b: Partial<MortgageBlockFields>) =>
  instalmentBelowInterestErrors(withLoan(b));

describe("instalmentBelowInterestErrors (ADR 0264 §1)", () => {
  it("refuses the #597 loan on its instalment", () =>
    expect(errorsOf(issue597)).toEqual([
      onLoan("INSTALMENT_BELOW_INTEREST", "monthlyInstalment"),
    ]));

  it("refuses an instalment exactly equal to the first interest", () =>
    expect(
      errorsOf({ ...issue597, monthlyInstalment: money("12500") }),
    ).toEqual([onLoan("INSTALMENT_BELOW_INTEREST", "monthlyInstalment")]));

  it("accepts an instalment 1 haléř above the first interest", () =>
    expect(
      errorsOf({ ...issue597, monthlyInstalment: money("12500.01") }),
    ).toEqual([]));

  it("leaves a loan without a term to D-17", () => {
    const noTerm = { ...issue597, loanTermYears: undefined };
    expect(errorsOf(noTerm)).toEqual([]);
    expect(validatePortfolio(withLoan(noTerm))).toEqual([
      onLoan("INSTALMENT_BELOW_INTEREST", "monthlyInstalment"),
    ]);
  });

  it("does not check a development loan, with a completion date or with draws only", () => {
    expect(
      errorsOf({ ...issue597, completionDate: isoDate("2027-07-15") }),
    ).toEqual([]);
    expect(
      errorsOf({
        ...issue597,
        draws: [{ date: isoDate("2026-12-15"), amount: money("500000") }],
      }),
    ).toEqual([]);
  });

  it("at 0 % refuses an instalment of 0 and accepts 1 Kč", () => {
    const zero = { ...issue597, interestRatePa: rate("0") };
    expect(errorsOf({ ...zero, monthlyInstalment: money("0") })).toEqual([
      onLoan("ZERO_RATE_ZERO_INSTALMENT", "monthlyInstalment"),
    ]);
    expect(errorsOf({ ...zero, monthlyInstalment: money("1") })).toEqual([]);
  });

  it("refuses a principal of 0 with a rate and an instalment of 0 (0 ≤ 0)", () =>
    expect(
      errorsOf({
        ...issue597,
        initialPrincipal: money("0"),
        monthlyInstalment: money("0"),
      }),
    ).toEqual([onLoan("INSTALMENT_BELOW_INTEREST", "monthlyInstalment")]));

  it("checks a successor at its own principal and rate, and names only it", () => {
    const owner = loan({
      ...issue597,
      id: "owner",
      startDate: isoDate("2021-01-17"),
      monthlyInstalment: money("16200"),
    });
    // 2,800,000 × 0.06 ÷ 12 = 14,000 Kč: 13,999 is below it, though above the owner's
    // first interest.
    const successor = loan({
      ...issue597,
      id: "succ",
      startDate: isoDate("2024-01-17"),
      initialPrincipal: money("2800000"),
      interestRatePa: rate("0.06"),
      monthlyInstalment: money("13999"),
    });
    const p: Portfolio = { ...portfolio, mortgages: [owner, successor] };
    expect(instalmentBelowInterestErrors(p)).toEqual([
      {
        ...onLoan("INSTALMENT_BELOW_INTEREST", "monthlyInstalment"),
        id: "succ",
      },
    ]);
  });

  it.each<[string, Partial<MortgageBlockFields>]>([
    ["NEGATIVE_AMOUNT", { monthlyInstalment: money("-1") }],
    ["NON_FINITE_NUMBER", { initialPrincipal: money(Number.NaN) }],
    ["RATE_OUT_OF_RANGE", { interestRatePa: rate("1.5") }],
    ["INVALID_TERM", { loanTermYears: 0 }],
  ])("gives nothing when %s is already reported on the block", (code, b) => {
    const p = withLoan({ ...issue597, ...b });
    expect(validatePortfolio(p).map((e) => e.code)).toContain(code);
    expect(instalmentBelowInterestErrors(p)).toEqual([]);
  });

  it("is not part of validateInputs or validatePortfolio (owner decision 2)", () => {
    expect(validateInputs(withLoan(issue597), assumptions)).toEqual([]);
    expect(validatePortfolio(withLoan(issue597))).toEqual([]);
  });

  it("gives nothing for the sample portfolio", () =>
    expect(instalmentBelowInterestErrors(portfolio)).toEqual([]));
});

describe("instalmentBelowInterest: one block, with its first interest (ADR 0264 §4)", () => {
  it("names the code and the first month's interest", () => {
    const found = instalmentBelowInterest(loan(issue597));
    expect(found?.code).toBe("INSTALMENT_BELOW_INTEREST");
    expect(found?.firstInterest.toFixed()).toBe("12500");
  });

  it("is undefined for a loan that passes", () =>
    expect(
      instalmentBelowInterest(
        loan({ ...issue597, monthlyInstalment: money("16200") }),
      ),
    ).toBeUndefined());
});
