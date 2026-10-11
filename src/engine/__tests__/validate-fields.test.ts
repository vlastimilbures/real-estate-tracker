// Where each validation problem points (DR-168): the code together with the entity,
// id, field and list index a fix needs, for checks no other suite pinned that far.
// Which codes each loan assert raises, and the loan event window, are in
// loan-events-validation.test.ts.
import { describe, it, expect } from "vitest";
import { money, rate } from "../brands";
import { isoDate } from "../dates";
import { validateInputs, validatePortfolio } from "../validate";
import type { Assumptions, IsoDate, MortgageBlockFields } from "../types";
import { assumptions, portfolio } from "./support/seed";
import { devBlock } from "./support/mixed";
import { onLoan, withLoan } from "./support/loan";

const bad = new Date(NaN) as IsoDate;

/** The problems of a portfolio whose only loan has these fields. */
const loanErrors = (b: Partial<MortgageBlockFields>) =>
  validatePortfolio(withLoan(b));

const onAssumptions = (a: Partial<Assumptions>) =>
  validateInputs(portfolio, { ...assumptions, ...a });

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

  it("a row error names its field; a list item also its index", () => {
    const v = portfolio.valuations[0];
    expect(
      validatePortfolio({
        ...portfolio,
        valuations: [{ ...v, validTo: bad }, ...portfolio.valuations.slice(1)],
      }),
    ).toEqual([
      { code: "INVALID_DATE", entity: "valuation", id: v.id, field: "validTo" },
    ]);
    expect(
      loanErrors({
        prepayments: [
          {
            date: isoDate("2025-01-17"),
            amount: money(1000),
            effect: "lowerInstalment",
            fee: money(NaN),
          },
        ],
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
    expect(dev({ date: bad })).toStrictEqual([
      onLoan("INVALID_DATE", "draws", 0),
    ]);
    expect(dev({ amount: money(NaN) })).toStrictEqual([
      onLoan("NON_FINITE_NUMBER", "draws", 0),
    ]);
    // A fractional term is rejected (ADR 0135); it gives no last draw date, so
    // the draw past its last payment reports nothing more.
    for (const loanTermYears of [1.5, 0.5])
      expect(
        loanErrors({
          ...devBlock,
          id: "m-x",
          propertyId: "javorova",
          loanTermYears,
          draws: [{ ...draw, date: isoDate("2027-11-15") }],
        }),
        `${loanTermYears}`,
      ).toStrictEqual([onLoan("INVALID_TERM", "loanTermYears")]);
  });

  it("non-finite loan amounts name their field", () => {
    expect(loanErrors({ initialPrincipal: money(NaN) })).toStrictEqual([
      onLoan("NON_FINITE_NUMBER", "initialPrincipal"),
    ]);
    expect(loanErrors({ interestRatePa: rate(NaN) })).toStrictEqual([
      onLoan("NON_FINITE_NUMBER", "interestRatePa"),
    ]);
    // An infinite principal derives no term, so no instalment check runs on it.
    expect(loanErrors({ initialPrincipal: money(Infinity) })).toStrictEqual([
      onLoan("NON_FINITE_NUMBER", "initialPrincipal"),
    ]);
  });

  it("property numbers and a valuation start name their field", () => {
    const [p, ...rest] = portfolio.properties;
    expect(
      validatePortfolio({
        ...portfolio,
        properties: [
          {
            ...p!,
            purchasePrice: money(NaN),
            appreciationOverridePa: rate(NaN),
            rentIndexOverridePa: rate(NaN),
          },
          ...rest,
        ],
      }),
    ).toStrictEqual(
      ["purchasePrice", "appreciationOverridePa", "rentIndexOverridePa"].map(
        (field) => ({
          code: "NON_FINITE_NUMBER",
          entity: "property",
          id: p!.id,
          field,
        }),
      ),
    );
    const [v, ...others] = portfolio.valuations;
    expect(
      validatePortfolio({
        ...portfolio,
        valuations: [{ ...v!, validFrom: bad }, ...others],
      }),
    ).toStrictEqual([
      {
        code: "INVALID_DATE",
        entity: "valuation",
        id: v!.id,
        field: "validFrom",
      },
    ]);
  });

  it("a value crash before year 0 is out of range", () => {
    expect(
      onAssumptions({ valueShock: { pct: rate("0.1"), atYear: -1 } }),
    ).toStrictEqual([
      {
        code: "SHOCK_OUT_OF_RANGE",
        entity: "assumptions",
        field: "valueShock",
      },
    ]);
  });

  it("cost ranges: the defaults and a holding-cost row raise the same codes in the same order", () => {
    const allBad = {
      propertyTaxYr: money(-1),
      insuranceYr: money(-1),
      svjMonthly: money(-1),
      otherYr: money(-1),
      mgmtPctRent: rate("1.5"),
      maintPctRent: rate("-0.1"),
    };
    const hc = portfolio.holdingCosts[0];
    expect(
      validateInputs(
        {
          ...portfolio,
          holdingCosts: [
            { ...hc, ...allBad },
            ...portfolio.holdingCosts.slice(1),
          ],
        },
        { ...assumptions, defaults: { ...assumptions.defaults, ...allBad } },
      ),
    ).toStrictEqual([
      ...[
        ["NEGATIVE_AMOUNT", "defaults.propertyTaxYr"],
        ["NEGATIVE_AMOUNT", "defaults.insuranceYr"],
        ["NEGATIVE_AMOUNT", "defaults.svjMonthly"],
        ["NEGATIVE_AMOUNT", "defaults.otherYr"],
        ["RATE_OUT_OF_RANGE", "defaults.mgmtPctRent"],
        ["RATE_OUT_OF_RANGE", "defaults.maintPctRent"],
      ].map(([code, field]) => ({ code, entity: "assumptions", field })),
      ...[
        ["NEGATIVE_AMOUNT", "propertyTaxYr"],
        ["NEGATIVE_AMOUNT", "insuranceYr"],
        ["NEGATIVE_AMOUNT", "svjMonthly"],
        ["NEGATIVE_AMOUNT", "otherYr"],
        ["RATE_OUT_OF_RANGE", "mgmtPctRent"],
        ["RATE_OUT_OF_RANGE", "maintPctRent"],
      ].map(([code, field]) => ({
        code,
        entity: "holdingCost",
        id: hc.id,
        field,
      })),
    ]);
  });
});
