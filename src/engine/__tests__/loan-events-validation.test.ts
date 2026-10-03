// ADR 0109: static checks of loan prepayments and recasts. The loan codes raise in
// buildSchedule (D-17); corrupt values (bad date, NaN, negative fee) are D-37 data
// codes that every entry point raises. Clamps that depend on the balance are not
// input errors (see loan-events.test.ts).
import { describe, it, expect } from "vitest";
import { money, rate } from "../brands";
import { isoDate } from "../dates";
import { isDevLoan } from "../amortization";
import { buildSchedule } from "../schedule";
import { EngineInputError } from "../errors";
import { validateInputs, type ValidationCode } from "../validate";
import type {
  LoanRecast,
  MortgageBlock,
  MortgageBlockFields,
  MortgagePrepayment,
} from "../types";
import { assumptions, portfolio } from "./support/seed";
import { devBlock } from "./support/mixed";

// Javorova: 2021-01-17, NPER term 364 payments, last payment 2051-05-17.
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

const dev = (b: Partial<MortgageBlockFields>): MortgageBlock =>
  loan({ ...devBlock, id: "m-x", propertyId: "javorova", ...b });

const prepay = (
  date: string,
  amount: string | number,
  extra: Partial<MortgagePrepayment> = {},
): MortgagePrepayment => ({
  date: isoDate(date),
  amount: money(amount),
  effect: "lowerInstalment",
  ...extra,
});

const toMaturity = (date: string, maturity: string): LoanRecast => ({
  date: isoDate(date),
  maturity: isoDate(maturity),
});

const toInstalment = (
  date: string,
  instalment: string | number,
): LoanRecast => ({
  date: isoDate(date),
  instalment: money(instalment),
});

function codes(block: MortgageBlock): ValidationCode[] {
  try {
    buildSchedule(block, assumptions);
  } catch (e) {
    expect(e).toBeInstanceOf(EngineInputError);
    return (e as EngineInputError).errors.map((x) => x.code);
  }
  return [];
}

/** Every reported problem of `block` inside the seed portfolio. */
function reported(block: MortgageBlock) {
  const p = {
    ...portfolio,
    mortgages: portfolio.mortgages.map((m) =>
      m.propertyId === "javorova" ? block : m,
    ),
  };
  return validateInputs(p, assumptions).map(({ code, field }) => ({
    code,
    field,
  }));
}

describe("ADR 0109: prepayment input checks", () => {
  const cases: [string, ValidationCode, string, MortgageBlock][] = [
    [
      "zero amount",
      "NON_POSITIVE_PREPAYMENT",
      "prepayments",
      loan({ prepayments: [prepay("2028-01-17", 0)] }),
    ],
    [
      "negative amount",
      "NON_POSITIVE_PREPAYMENT",
      "prepayments",
      loan({ prepayments: [prepay("2028-01-17", -1)] }),
    ],
    [
      "dated on the loan start",
      "EVENT_BEFORE_START",
      "prepayments",
      loan({ prepayments: [prepay("2021-01-17", 1000)] }),
    ],
    [
      "dated before the loan start",
      "EVENT_BEFORE_START",
      "prepayments",
      loan({ prepayments: [prepay("2020-12-01", 1000)] }),
    ],
    [
      "dated on the last payment",
      "EVENT_AFTER_SCHEDULE_END",
      "prepayments",
      loan({ prepayments: [prepay("2051-05-17", 1000)] }),
    ],
    [
      "dated after a dev loan's last payment",
      "EVENT_AFTER_SCHEDULE_END",
      "prepayments",
      dev({ prepayments: [prepay("2056-03-01", 1000)] }),
    ],
  ];

  it.each(cases)("%s raises %s", (_, code, field, block) => {
    expect(codes(block)).toContain(code);
    expect(reported(block)).toContainEqual({ code, field });
  });

  it("accepts a valid prepayment, a zero fee and a date before the last payment", () => {
    const block = loan({
      prepayments: [
        prepay("2028-01-20", 1000, { fee: money(0) }),
        prepay("2051-05-16", 1000, { effect: "shortenTerm" }),
      ],
    });
    expect(codes(block)).toEqual([]);
    expect(reported(block)).toEqual([]);
  });

  it("reports corrupt values as data errors", () => {
    expect(
      reported(loan({ prepayments: [prepay("2028-01-17", "NaN")] })),
    ).toContainEqual({ code: "NON_FINITE_NUMBER", field: "prepayments" });
    expect(
      reported(
        loan({ prepayments: [prepay("2028-01-17", 1, { fee: money(-1) })] }),
      ),
    ).toContainEqual({ code: "NEGATIVE_AMOUNT", field: "prepayments" });
    expect(
      reported(
        loan({
          prepayments: [
            { ...prepay("2028-01-17", 1), date: new Date(NaN) as never },
          ],
        }),
      ),
    ).toContainEqual({ code: "INVALID_DATE", field: "prepayments" });
  });

  it("never makes a plain loan a development loan", () => {
    expect(
      isDevLoan(
        loan({
          prepayments: [prepay("2028-01-17", 1000)],
          recasts: [toMaturity("2028-01-17", "2045-01-17")],
        }),
      ),
    ).toBe(false);
  });
});

describe("ADR 0109: recast input checks", () => {
  const cases: [string, ValidationCode, MortgageBlock][] = [
    [
      "both a maturity and an instalment",
      "INVALID_RECAST",
      loan({
        recasts: [
          {
            date: isoDate("2031-01-17"),
            maturity: isoDate("2045-01-17"),
            instalment: money(9000),
          } as unknown as LoanRecast,
        ],
      }),
    ],
    [
      "neither a maturity nor an instalment",
      "INVALID_RECAST",
      loan({
        recasts: [{ date: isoDate("2031-01-17") } as unknown as LoanRecast],
      }),
    ],
    [
      "an instalment of zero",
      "INVALID_RECAST",
      loan({ recasts: [toInstalment("2031-01-17", 0)] }),
    ],
    [
      "dated on the loan start",
      "EVENT_BEFORE_START",
      loan({ recasts: [toMaturity("2021-01-17", "2045-01-17")] }),
    ],
    [
      "a maturity before the next payment",
      "INVALID_RECAST_MATURITY",
      // Dated on payment 120's due date; the next payment is 121 (2031-02-17).
      loan({ recasts: [toMaturity("2031-01-17", "2031-02-16")] }),
    ],
    [
      "a maturity beyond loan start + 50 years",
      "INVALID_RECAST_MATURITY",
      loan({ recasts: [toMaturity("2031-01-17", "2071-02-17")] }),
    ],
    [
      // An instalment recast can run to the cap, so only the cap bounds its date.
      "dated on the 50-year cap",
      "EVENT_AFTER_SCHEDULE_END",
      loan({ recasts: [toInstalment("2071-01-17", 9000)] }),
    ],
    [
      // ADR 0116: the loan would end before it finishes drawing.
      "a dev loan maturity on or before its completion",
      "INVALID_RECAST_MATURITY",
      dev({ recasts: [toMaturity("2027-01-10", "2027-08-01")] }),
    ],
    [
      // The last tranche lands on the 2027-09-01 payment and would restore the
      // contract term there, undoing the recast (ADR 0116 §2, §15).
      "a dev loan maturity on the payment the last tranche lands on",
      "INVALID_RECAST_MATURITY",
      dev({ recasts: [toMaturity("2027-01-10", "2027-09-01")] }),
    ],
    [
      "an instalment recast before a dev loan's completion",
      "RECAST_INSTALMENT_BEFORE_COMPLETION",
      dev({ recasts: [toInstalment("2027-08-20", 15000)] }),
    ],
  ];

  it.each(cases)("%s raises %s", (_, code, block) => {
    expect(codes(block)).toContain(code);
    expect(reported(block)).toContainEqual({ code, field: "recasts" });
  });

  it("accepts the next payment and the 50-year cap as maturities", () => {
    expect(
      codes(loan({ recasts: [toMaturity("2031-01-17", "2031-02-17")] })),
    ).toEqual([]);
    expect(
      codes(loan({ recasts: [toMaturity("2031-01-17", "2071-01-17")] })),
    ).toEqual([]);
  });

  it("a later recast maturity moves the last date an event may have", () => {
    const block = loan({
      recasts: [toMaturity("2031-01-17", "2060-01-17")],
      prepayments: [prepay("2055-01-17", 1000)],
    });
    expect(codes(block)).toEqual([]);
  });

  it("an instalment recast lets events run to the 50-year cap", () => {
    const block = loan({
      recasts: [toInstalment("2031-01-17", 3000)],
      prepayments: [prepay("2070-12-17", 1000)],
    });
    expect(codes(block)).toEqual([]);
  });

  it("allows a maturity recast before a dev loan's completion", () => {
    expect(
      codes(dev({ recasts: [toMaturity("2027-01-01", "2050-03-01")] })),
    ).toEqual([]);
  });

  it("allows a dev loan maturity after the completion's payment", () => {
    // Completion 2027-08-20 lands on the 2027-09-01 payment; the next is 2027-10-01.
    expect(
      codes(dev({ recasts: [toMaturity("2027-01-10", "2027-10-01")] })),
    ).toEqual([]);
  });

  it("allows an instalment recast after a dev loan's completion", () => {
    expect(
      codes(dev({ recasts: [toInstalment("2027-08-21", 15000)] })),
    ).toEqual([]);
  });

  it("reports a corrupt recast date or instalment as data errors", () => {
    expect(
      reported(
        loan({
          recasts: [
            { date: new Date(NaN) as never, maturity: isoDate("2045-01-17") },
          ],
        }),
      ),
    ).toContainEqual({ code: "INVALID_DATE", field: "recasts" });
    expect(
      reported(loan({ recasts: [toInstalment("2031-01-17", "NaN")] })),
    ).toContainEqual({ code: "NON_FINITE_NUMBER", field: "recasts" });
  });
});

describe("ADR 0116: event issues name the item", () => {
  /** The javorova block's issues with their item index. */
  const indexed = (block: MortgageBlock) =>
    validateInputs(
      {
        ...portfolio,
        mortgages: portfolio.mortgages.map((m) =>
          m.propertyId === "javorova" ? block : m,
        ),
      },
      assumptions,
    )
      .filter((e) => e.id === block.id)
      .map(({ code, field, index }) => ({ code, field, index }));

  it("indexes each prepayment as listed", () => {
    const block = loan({
      prepayments: [
        prepay("2031-01-17", 1000),
        prepay("2031-02-17", 0),
        prepay("2020-01-01", 1000),
      ],
    });
    expect(indexed(block)).toEqual([
      { code: "NON_POSITIVE_PREPAYMENT", field: "prepayments", index: 1 },
      { code: "EVENT_BEFORE_START", field: "prepayments", index: 2 },
    ]);
  });

  it("indexes each recast as listed", () => {
    const block = loan({
      recasts: [
        toMaturity("2031-01-17", "2045-01-17"),
        toMaturity("2031-01-17", "2031-02-16"),
        toInstalment("2032-01-17", 0),
      ],
    });
    expect(indexed(block)).toEqual([
      { code: "INVALID_RECAST_MATURITY", field: "recasts", index: 1 },
      { code: "INVALID_RECAST", field: "recasts", index: 2 },
    ]);
  });
});
