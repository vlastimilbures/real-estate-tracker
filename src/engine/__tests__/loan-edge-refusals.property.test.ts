// ADR 0226: the two refused loan shapes, over random dates.
//
// §1 A tranche is valid on or before the last-but-two payment date EDATE(start, T−2).
// Every such tranche, on a loan starting on day 28–31 (the month-end clamps) at any
// baseDate, is accepted and lands before the final payment: the row that makes the last
// payment draws nothing, so no tranche is repaid in one shot.
// §2 A block starting on or before EDATE(previous start, 1) is refused, on both blocks;
// a later start is accepted, and two accepted blocks never draw in one grid month.
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { addDays, edate, utc } from "../dates";
import { drawMonth } from "../amortization";
import { money, rate } from "../brands";
import { EngineInputError } from "../errors";
import { buildSchedule, lastPaymentMonth, propertySchedule } from "../schedule";
import type { IsoDate, MortgageBlock } from "../types";
import { assertLoanInputs, validatePortfolio } from "../validate";
import type { RefLoan } from "./reference/mortgageReference";
import { both, maxDev, TIGHT } from "./reference/eventHarness";
import { fcRuns } from "./support/fcRuns";
import { loan } from "./support/loan";
import { assumptions, portfolio } from "./support/seed";

// Fixed seed ⇒ reproducible in CI; nightly runs 2000 with a date seed (`fcRuns`).
const { runs: RUNS, timeout: TIMEOUT } = fcRuns(20261116, 100);

const at = (baseDate: IsoDate) => ({ ...assumptions, baseDate });

/** The last day of a month. */
const lastDay = (year: number, month: number) =>
  utc(year, month + 1, 0).getUTCDate();

/** A day of a month in 2020–2030, from `days`; a day the month lacks clamps to its end. */
const dayIn = (days: fc.Arbitrary<number>) =>
  fc
    .record({
      year: fc.integer({ min: 2020, max: 2030 }),
      month: fc.integer({ min: 1, max: 12 }),
      day: days,
    })
    .map(({ year, month, day }) =>
      utc(year, month, Math.min(day, lastDay(year, month))),
    );

/** A development loan with one tranche on or before payment T−2, and a baseDate from
 *  about a year before the start to payment T−3. */
const lateTrancheLoan = fc
  .record({
    start: dayIn(fc.integer({ min: 28, max: 31 })),
    termYears: fc.integer({ min: 1, max: 5 }),
    k: fc.nat(),
    back: fc.integer({ min: 0, max: 27 }),
    baseShift: fc.nat(),
  })
  .map(({ start, termYears, k, back, baseShift }) => {
    const T = termYears * 12;
    const payment = 1 + (k % (T - 2)); // 1 … T−2
    const date = addDays(edate(start, payment), -back);
    const span =
      400 + (edate(start, T - 3).getTime() - start.getTime()) / 864e5;
    const baseDate = addDays(start, (baseShift % span) - 400);
    const block = {
      id: "m-dev",
      propertyId: "javorova",
      startDate: start,
      initialPrincipal: money("100000"),
      fixationYears: 5,
      interestRatePa: rate("0.05"),
      monthlyInstalment: money("0"),
      loanTermYears: termYears,
      draws: [{ date, amount: money("500000") }],
    } as MortgageBlock;
    return { block, baseDate };
  })
  .filter(({ block }) => block.draws![0]!.date > block.startDate);

describe("ADR 0226 §1: a tranche on or before payment T−2", () => {
  it(
    "is accepted and never lands on the final payment, month-end clamps included",
    () => {
      fc.assert(
        fc.property(lateTrancheLoan, ({ block, baseDate }) => {
          expect(() => assertLoanInputs(block)).not.toThrow();
          const rows = buildSchedule(block, at(baseDate));
          const last = lastPaymentMonth(rows);
          expect(last).toBeGreaterThan(0);
          expect(rows[last - 1]!.drawn.isZero()).toBe(true);
          expect(rows[last - 1]!.endBalance.isZero()).toBe(true);
        }),
        RUNS,
      );
    },
    TIMEOUT,
  );

  it("the engine matches the reference on the ADR 0139 loan drawn on payment T−2", () => {
    // 31 Jan 2026 over 24 months; payment 22 is due 30 Nov 2027. The baseDates on the
    // 28th and 30th were the month-end corners of ADR 0139; 2025-12-31 is a future loan.
    const l: RefLoan = {
      start: "2026-01-31",
      principal: 100000,
      ratePa: 0.05,
      instalment: 0,
      fixationMonths: 60,
      termMonths: 24,
      draws: [{ date: "2027-11-30", amount: 500000 }],
    };
    for (const base of ["2026-02-28", "2026-04-30", "2025-12-31"]) {
      const { e, r } = both(l, base);
      expect(maxDev(e, r)).toBeLessThanOrEqual(TIGHT);
      expect(e[lastPaymentMonth(e) - 1]!.drawn.isZero()).toBe(true);
    }
  });
});

/** Two plain blocks of Javorova, X then Y `days(X)` later, and a baseDate. */
const pair = (days: (x: IsoDate) => fc.Arbitrary<number>) =>
  fc
    .record({
      x: dayIn(fc.integer({ min: 1, max: 31 })),
      baseShift: fc.integer({ min: -400, max: 400 }),
    })
    .chain(({ x, baseShift }) =>
      days(x).map((d) => ({
        blocks: [
          loan({ id: "m-x", startDate: x }),
          loan({ id: "m-y", startDate: addDays(x, d) }),
        ],
        baseDate: addDays(x, baseShift),
      })),
    );

/** Whole days from `x` to EDATE(x, 1). */
const toNextMonth = (x: IsoDate) =>
  Math.round((edate(x, 1).getTime() - x.getTime()) / 864e5);

const refinanceCodes = (blocks: MortgageBlock[]) =>
  validatePortfolio({ ...portfolio, mortgages: blocks })
    .filter((e) => e.code === "REFINANCE_WITHIN_A_MONTH")
    .map((e) => [e.id, e.field]);

describe("ADR 0226 §2: a successor within a month of the block it replaces", () => {
  it(
    "Y on or before EDATE(X, 1) is refused on both blocks, at every baseDate",
    () => {
      fc.assert(
        fc.property(
          pair((x) => fc.integer({ min: 1, max: toNextMonth(x) })),
          ({ blocks, baseDate }) => {
            expect(refinanceCodes(blocks)).toEqual([
              ["m-x", "startDate"],
              ["m-y", "startDate"],
            ]);
            expect(() => propertySchedule(blocks, at(baseDate))).toThrow(
              EngineInputError,
            );
          },
        ),
        RUNS,
      );
    },
    TIMEOUT,
  );

  it(
    "Y after EDATE(X, 1) is accepted, and the two never draw in one grid month",
    () => {
      fc.assert(
        fc.property(
          pair((x) =>
            fc.integer({ min: toNextMonth(x) + 1, max: toNextMonth(x) + 400 }),
          ),
          ({ blocks, baseDate }) => {
            expect(refinanceCodes(blocks)).toEqual([]);
            expect(() => propertySchedule(blocks, at(baseDate))).not.toThrow();
            const [x, y] = blocks as [MortgageBlock, MortgageBlock];
            if (x.startDate > baseDate)
              expect(drawMonth(y, baseDate)).toBeGreaterThan(
                drawMonth(x, baseDate),
              );
          },
        ),
        RUNS,
      );
    },
    TIMEOUT,
  );
});
