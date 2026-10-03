// validateInputs (P4a): valid fixtures report nothing; each code fires on the input it
// names. The engine raises on the D-17 loan codes (input-errors.test.ts) and the D-37
// data and D-38 range codes (entry-errors.test.ts).
import { describe, it, expect } from "vitest";
import { D } from "../../lib/money";
import { rate } from "../brands";
import { isoDate } from "../dates";
import {
  validateInputs,
  validatePortfolio,
  type ValidationCode,
} from "../validate";
import type {
  Assumptions,
  IsoDate,
  MortgageBlock,
  MortgageBlockFields,
  Portfolio,
} from "../types";
import { assumptions, portfolio } from "./support/seed";
import { devBlock, mixed } from "./support/mixed";
import { money } from "../brands";

const codes = (p: Portfolio, a: Assumptions = assumptions, asOf?: Date) =>
  validateInputs(p, a, asOf).map((e) => e.code);

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

const expectCode = (p: Portfolio, code: ValidationCode) =>
  expect(codes(p)).toContain(code);

describe("validateInputs", () => {
  it("validatePortfolio is validateInputs without the assumption checks", () => {
    const p: Portfolio = {
      ...withLoan({ monthlyInstalment: money(1) }),
      valuations: [{ ...portfolio.valuations[0], marketValue: money(-1) }],
    };
    const badAssumptions = { ...assumptions, horizonYears: 0 };
    const all = validateInputs(p, badAssumptions);
    expect(all.some((e) => e.entity === "assumptions")).toBe(true);
    expect(validatePortfolio(p)).toEqual(
      all.filter((e) => e.entity !== "assumptions"),
    );
    expect(validatePortfolio(p).length).toBeGreaterThan(1);
  });

  it("reports nothing for the seed and the mixed fixture", () => {
    expect(validateInputs(portfolio, assumptions)).toEqual([]);
    expect(validateInputs(mixed, assumptions)).toEqual([]);
  });

  it("names entity, id and field", () => {
    expect(
      validateInputs(withLoan({ initialPrincipal: money(-1) }), assumptions),
    ).toContainEqual({
      code: "NEGATIVE_PRINCIPAL",
      entity: "mortgage",
      id: "m-x",
      field: "initialPrincipal",
    });
  });

  it("loan terms (DR-014, DR-018, DR-043, DR-051)", () => {
    expectCode(
      withLoan({ monthlyInstalment: money("2550") }),
      "INSTALMENT_BELOW_INTEREST",
    );
    expectCode(
      withLoan({ interestRatePa: rate(0), monthlyInstalment: money(0) }),
      "ZERO_RATE_ZERO_INSTALMENT",
    );
    expectCode(
      withLoan({ ...devBlock, loanTermYears: undefined }),
      "MISSING_TERM_FOR_DEV_LOAN",
    );
    expectCode(withLoan({ loanTermYears: 0 }), "INVALID_TERM");
    expectCode(withLoan({ fixationYears: -1 }), "INVALID_TERM");
    expectCode(withLoan({ interestRatePa: rate("1.5") }), "RATE_OUT_OF_RANGE");
    expectCode(withLoan({ monthlyInstalment: money(-5) }), "NEGATIVE_AMOUNT");
    // A term entered explicitly makes the NPER checks irrelevant.
    expect(
      codes(withLoan({ monthlyInstalment: money("3000"), loanTermYears: 30 })),
    ).toEqual([]);
  });

  it("development-loan features", () => {
    const d = (x: Partial<MortgageBlockFields>) =>
      withLoan({ ...devBlock, propertyId: "javorova", ...x });
    expectCode(
      d({ draws: [{ date: isoDate("2020-01-01"), amount: money(1) }] }),
      "DRAW_BEFORE_START",
    );
    // D-42 (DR-120): a draw on the start date itself is rejected too.
    expectCode(
      d({ draws: [{ date: devBlock.startDate, amount: money(1) }] }),
      "DRAW_BEFORE_START",
    );
    expectCode(
      d({ draws: [{ date: isoDate("2027-01-01"), amount: money(0) }] }),
      "NON_POSITIVE_DRAW",
    );
    // DR-074 (ADR 0079): a draw on or after the final payment date (start + term).
    expectCode(
      d({ draws: [{ date: isoDate("2056-03-01"), amount: money(1) }] }),
      "DRAW_AFTER_SCHEDULE_END",
    );
    expectCode(
      d({ draws: [{ date: isoDate("2070-01-01"), amount: money(1) }] }),
      "DRAW_AFTER_SCHEDULE_END",
    );
    expect(
      codes(d({ draws: [{ date: isoDate("2056-02-29"), amount: money(1) }] })),
    ).toEqual([]);
    expectCode(
      d({ completionDate: isoDate("2020-01-01") }),
      "COMPLETION_BEFORE_START",
    );
  });

  it("duplicate block starts and orphans", () => {
    const p: Portfolio = {
      ...portfolio,
      mortgages: [loan({ id: "a" }), loan({ id: "b" })],
    };
    expectCode(p, "DUPLICATE_BLOCK_START");
    expectCode(
      { ...portfolio, mortgages: [loan({ propertyId: "nope" })] },
      "ORPHAN_ROW",
    );
  });

  it("effective-dated rows and holding costs", () => {
    const lease = portfolio.leases[0];
    expectCode(
      {
        ...portfolio,
        leases: [{ ...lease, endDate: isoDate("2020-01-01") }],
      },
      "END_BEFORE_START",
    );
    expectCode(
      {
        ...portfolio,
        valuations: [{ ...portfolio.valuations[0], marketValue: money(-1) }],
      },
      "NEGATIVE_AMOUNT",
    );
    expectCode(
      {
        ...portfolio,
        holdingCosts: [...portfolio.holdingCosts, portfolio.holdingCosts[0]],
      },
      "DUPLICATE_HOLDING_COST",
    );
  });

  it("holding-cost shares outside 0–1 and negative costs (D-54, DR-127)", () => {
    const hc = portfolio.holdingCosts[0];
    const withCost = (h: Partial<typeof hc>): Portfolio => ({
      ...portfolio,
      holdingCosts: [{ ...hc, ...h }, ...portfolio.holdingCosts.slice(1)],
    });
    const errors = (p: Portfolio) =>
      validateInputs(p, assumptions).map((e) => [e.code, e.field]);
    expect(errors(withCost({ mgmtPctRent: rate("1.2") }))).toEqual([
      ["RATE_OUT_OF_RANGE", "mgmtPctRent"],
    ]);
    expect(errors(withCost({ maintPctRent: rate("-0.01") }))).toEqual([
      ["RATE_OUT_OF_RANGE", "maintPctRent"],
    ]);
    for (const field of [
      "propertyTaxYr",
      "insuranceYr",
      "svjMonthly",
      "otherYr",
    ] as const) {
      expect(errors(withCost({ [field]: D(-1) }))).toEqual([
        ["NEGATIVE_AMOUNT", field],
      ]);
    }
    expect(
      errors(withCost({ mgmtPctRent: rate("1"), otherYr: money(0) })),
    ).toEqual([]);
  });

  it("invalid dates and non-finite numbers", () => {
    const bad = new Date(NaN) as IsoDate;
    expectCode(
      {
        ...portfolio,
        properties: [{ ...portfolio.properties[0], purchaseDate: bad }],
      },
      "INVALID_DATE",
    );
    expectCode(
      withLoan({ monthlyInstalment: money(NaN) }),
      "NON_FINITE_NUMBER",
    );
  });

  it("assumptions, shocks and the as-of date", () => {
    const a = (x: Partial<Assumptions>) =>
      codes(portfolio, { ...assumptions, ...x });
    expect(a({ horizonYears: 0 })).toContain("HORIZON_NOT_POSITIVE");
    // ADR 0075 (DR-176): negative cost defaults, like the overrides (D-54).
    for (const f of [
      "propertyTaxYr",
      "insuranceYr",
      "svjMonthly",
      "otherYr",
    ] as const) {
      expect(
        validateInputs(portfolio, {
          ...assumptions,
          defaults: { ...assumptions.defaults, [f]: money(-1) },
        }),
      ).toEqual([
        {
          code: "NEGATIVE_AMOUNT",
          entity: "assumptions",
          field: `defaults.${f}`,
        },
      ]);
    }
    expect(a({ vacancyAllowance: rate("1.2") })).toContain("RATE_OUT_OF_RANGE");
    expect(a({ inflationPa: rate(Infinity) })).toContain("NON_FINITE_NUMBER");
    expect(
      a({ rateShock: { deltaPa: rate("0.02"), durationYears: -1 } }),
    ).toContain("SHOCK_OUT_OF_RANGE");
    expect(a({ valueShock: { pct: rate("1.5"), atYear: 0 } })).toContain(
      "SHOCK_OUT_OF_RANGE",
    );
    expect(codes(portfolio, assumptions, isoDate("2024-01-01"))).toEqual([
      "ASOF_BEFORE_BASEDATE",
    ]);
    expect(codes(portfolio, assumptions, assumptions.baseDate)).toEqual([]);
  });
});
