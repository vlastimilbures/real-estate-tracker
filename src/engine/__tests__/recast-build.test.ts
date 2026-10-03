// ADR 0116 §G: characterisation of schedules whose recasts let the build run past the
// contract term. The grid stops at the loan's last payment instead of building to the
// 50-year cap and trimming; every row, its count and the outcomes must stay identical.
import { createHash } from "node:crypto";
import { describe, it, expect } from "vitest";
import { money, rate } from "../brands";
import { isoDate } from "../dates";
import { propertySchedule } from "../schedule";
import type { MortgageBlock, MortgagePrepayment, LoanRecast } from "../types";
import { assumptions, portfolio } from "./support/seed";
import { devBlock } from "./support/mixed";

const seedJavorova = portfolio.mortgages.find(
  (m) => m.propertyId === "javorova",
);
if (!seedJavorova) throw new Error("seed block missing");
const javorova: MortgageBlock = seedJavorova;

const prepay = (date: string, amount: number): MortgagePrepayment => ({
  date: isoDate(date),
  amount: money(amount),
  effect: "lowerInstalment",
});
const toInstalment = (date: string, instalment: number): LoanRecast => ({
  date: isoDate(date),
  instalment: money(instalment),
});
const toMaturity = (date: string, maturity: string): LoanRecast => ({
  date: isoDate(date),
  maturity: isoDate(maturity),
});
const withEvents = (
  b: MortgageBlock,
  recasts: LoanRecast[],
  prepayments?: MortgagePrepayment[],
): MortgageBlock => ({ ...b, recasts, prepayments }) as MortgageBlock;

/** Rows, outcomes and refinances as one string: any change shows as a new hash. */
function fingerprint(blocks: MortgageBlock[]): string {
  const s = propertySchedule(blocks, assumptions);
  const text = JSON.stringify({
    rows: s.rows.map((r) =>
      [
        r.month,
        r.date.toISOString(),
        r.ratePa,
        r.instalment,
        r.interest,
        r.principal,
        r.prepaid,
        r.prepaymentFee,
        r.drawn,
        r.endBalance,
      ].map(String),
    ),
    outcomes: s.eventOutcomes.map((o) => [
      o.blockId,
      o.kind,
      o.date.toISOString(),
      o.month,
      String(o.applied),
      String(o.fee),
      o.issue,
    ]),
    refinances: s.refinances.map((x) => [
      x.month,
      String(x.paidOff),
      String(x.drawn),
    ]),
  });
  return `${s.rows.length}:${createHash("sha256").update(text).digest("hex").slice(0, 16)}`;
}

const refi: MortgageBlock = {
  id: "refi",
  propertyId: javorova.propertyId,
  startDate: isoDate("2036-01-17"),
  initialPrincipal: money(900000),
  fixationYears: 5,
  interestRatePa: rate("0.039"),
  monthlyInstalment: money(9800),
} as MortgageBlock;

const dev = { ...devBlock, id: "m-dev" } as MortgageBlock;

describe("ADR 0116: schedules a recast extends", () => {
  it.each<[string, MortgageBlock[]]>([
    [
      "lower instalment",
      [withEvents(javorova, [toInstalment("2031-01-17", 7000)])],
    ],
    [
      "higher instalment",
      [withEvents(javorova, [toInstalment("2031-01-17", 15000)])],
    ],
    [
      "capped at 50 years",
      [withEvents(javorova, [toInstalment("2031-01-17", 5300)])],
    ],
    [
      "below the interest",
      [withEvents(javorova, [toInstalment("2031-01-17", 100)])],
    ],
    [
      "later maturity",
      [withEvents(javorova, [toMaturity("2031-01-17", "2065-01-17")])],
    ],
    [
      "recast, then paid off",
      [
        withEvents(
          javorova,
          [toInstalment("2031-01-17", 6000)],
          [prepay("2040-02-01", 5000000)],
        ),
      ],
    ],
    [
      "dev loan after completion",
      [withEvents(dev, [toInstalment("2028-01-10", 9000)])],
    ],
    [
      "refinanced",
      [withEvents(javorova, [toInstalment("2031-01-17", 6000)]), refi],
    ],
  ])("%s", (_, blocks) => {
    expect(fingerprint(blocks)).toMatchSnapshot();
  });
});
