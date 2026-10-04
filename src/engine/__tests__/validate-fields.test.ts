// Where each validation problem points (DR-168): the code together with the entity,
// id, field and list index a fix needs, for checks no other suite pinned that far, and
// which codes each loan assert raises. Also the event window a contract term and its
// recasts set (ADR 0109): an invalid term or recast maturity leaves it open.
import { describe, it, expect } from "vitest";
import { money, rate } from "../brands";
import { isoDate } from "../dates";
import { eventTermMonths, termMonths } from "../amortization";
import { EngineInputError } from "../errors";
import {
  assertLoanInputs,
  assertLoanRows,
  validateInputs,
  validatePortfolio,
  type EngineValidationError,
} from "../validate";
import type {
  Assumptions,
  IsoDate,
  LoanRecast,
  MortgageBlock,
  MortgageBlockFields,
  MortgagePrepayment,
  Portfolio,
} from "../types";
import { assumptions, portfolio } from "./support/seed";
import { devBlock } from "./support/mixed";

const bad = new Date(NaN) as IsoDate;

// Javorova: 2021-01-17, NPER term 364 payments.
const loan = (b: Partial<MortgageBlockFields>): MortgageBlock =>
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

const withLoan = (b: Partial<MortgageBlockFields>): Portfolio => ({
  ...portfolio,
  mortgages: [loan(b)],
});

/** The problems of a portfolio whose only loan has these fields. */
const loanErrors = (b: Partial<MortgageBlockFields>) =>
  validatePortfolio(withLoan(b));

const onLoan = (
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

const onAssumptions = (a: Partial<Assumptions>) =>
  validateInputs(portfolio, { ...assumptions, ...a });

const prepay = (
  date: string,
  extra: Partial<MortgagePrepayment> = {},
): MortgagePrepayment => ({
  date: isoDate(date),
  amount: money(1000),
  effect: "lowerInstalment",
  ...extra,
});

const toMaturity = (date: string, maturity: IsoDate): LoanRecast => ({
  date: isoDate(date),
  maturity,
});

const raised = (f: () => void): readonly EngineValidationError[] => {
  try {
    f();
  } catch (e) {
    if (e instanceof EngineInputError) return e.errors;
    throw e;
  }
  throw new Error("expected an EngineInputError");
};

describe("validation problem fields", () => {
  it("assumptions: a non-finite shock delta and the maintenance share default", () => {
    expect(
      onAssumptions({ rateShock: { deltaPa: rate(NaN), durationYears: 1 } }),
    ).toStrictEqual([
      { code: "NON_FINITE_NUMBER", entity: "assumptions", field: "rateShock" },
    ]);
    expect(
      onAssumptions({
        defaults: { ...assumptions.defaults, maintPctRent: rate("1.5") },
      }),
    ).toStrictEqual([
      {
        code: "RATE_OUT_OF_RANGE",
        entity: "assumptions",
        field: "defaults.maintPctRent",
      },
    ]);
  });

  it("a row error carries no index key; list items carry theirs", () => {
    const v = portfolio.valuations[0];
    expect(
      validatePortfolio({
        ...portfolio,
        valuations: [{ ...v, validTo: bad }, ...portfolio.valuations.slice(1)],
      }),
    ).toStrictEqual([
      { code: "INVALID_DATE", entity: "valuation", id: v.id, field: "validTo" },
    ]);
    expect(
      loanErrors({
        prepayments: [prepay("2025-01-17", { fee: money(NaN) })],
      }),
    ).toStrictEqual([onLoan("NON_FINITE_NUMBER", "prepayments", 0)]);
  });

  it("loan amounts and draws", () => {
    expect(loanErrors({ monthlyInstalment: money(-1) })).toContainEqual(
      onLoan("NEGATIVE_AMOUNT", "monthlyInstalment"),
    );
    const draw = devBlock.draws![0];
    const dev = (d: Partial<typeof draw>) =>
      loanErrors({
        ...devBlock,
        id: "m-x",
        propertyId: "javorova",
        draws: [{ ...draw, ...d }],
      });
    expect(dev({ date: bad })).toStrictEqual([onLoan("INVALID_DATE", "draws")]);
    expect(dev({ amount: money(NaN) })).toStrictEqual([
      onLoan("NON_FINITE_NUMBER", "draws"),
    ]);
  });
});

describe("loan asserts raise only their own codes", () => {
  // INVALID_TERM is a D-17 loan code; a bad date is a D-37 data code.
  const block = loan({ fixationYears: -1, contractMaturityDate: bad });

  it("assertLoanInputs raises the loan codes", () => {
    expect(raised(() => assertLoanInputs(block))).toStrictEqual([
      onLoan("INVALID_TERM", "fixationYears"),
    ]);
  });

  it("assertLoanRows raises the data codes", () => {
    expect(raised(() => assertLoanRows([block]))).toStrictEqual([
      onLoan("INVALID_DATE", "contractMaturityDate"),
    ]);
  });

  it("termMonths names the mortgage it cannot derive a term for", () => {
    expect(
      raised(() =>
        termMonths(
          loan({ interestRatePa: rate(0), monthlyInstalment: money(0) }),
        ),
      ),
    ).toStrictEqual([onLoan("ZERO_RATE_ZERO_INSTALMENT", "monthlyInstalment")]);
  });
});

describe("loan event window (ADR 0109)", () => {
  // A 10-year contract: the last payment is due 2031-01-17 (payment 120).
  const tenYears = { loanTermYears: 10 };

  it("is the contract term without recasts", () => {
    expect(eventTermMonths(loan(tenYears), 120)).toBe(120);
  });

  it("a recast maturity moves the end to that maturity, not to the cap", () => {
    expect(
      loanErrors({
        ...tenYears,
        recasts: [toMaturity("2025-01-17", isoDate("2033-01-17"))],
        prepayments: [prepay("2032-01-20"), prepay("2034-01-20")],
      }),
    ).toStrictEqual([onLoan("EVENT_AFTER_SCHEDULE_END", "prepayments", 1)]);
  });

  it("a recast with an invalid maturity does not move the end", () => {
    expect(
      loanErrors({
        ...tenYears,
        recasts: [toMaturity("2025-01-17", bad)],
        prepayments: [prepay("2032-01-20")],
      }),
    ).toStrictEqual([
      onLoan("EVENT_AFTER_SCHEDULE_END", "prepayments", 0),
      onLoan("INVALID_DATE", "recasts", 0),
    ]);
  });

  it("an invalid contract term leaves the window open and the maturity unchecked", () => {
    // Payment 13 is due by 2022-03-01, before the recast's next payment (15).
    const recasts = [toMaturity("2022-03-01", isoDate("2022-03-01"))];
    expect(loanErrors({ loanTermYears: 0, recasts })).toStrictEqual([
      onLoan("INVALID_TERM", "loanTermYears"),
    ]);
    // A fractional term is not rejected, but gives no whole-payment term either.
    expect(loanErrors({ loanTermYears: 1.5, recasts })).toStrictEqual([]);
  });

  it("a recast dated before the start is not checked further", () => {
    expect(
      loanErrors({
        recasts: [toMaturity("2020-06-01", isoDate("2020-06-01"))],
      }),
    ).toStrictEqual([onLoan("EVENT_BEFORE_START", "recasts", 0)]);
  });
});
