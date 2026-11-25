// ADR 0235 §2: a plain loan's opening balance is replayed month by month. For every
// ordinary plain loan (its instalment repays it by its term, every payment so far at
// the original rate, no event) the replay equals the closed form the engine used
// before, which now lives in the reference model (`closedFormBalance`).
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { D } from "../../../lib/money";
import { PMT } from "../support/excelFinance";
import { isoDate } from "../../dates";
import { rate } from "../../brands";
import { openingBalance } from "../../schedule";
import { fcRuns } from "../support/fcRuns";
import { assumptions as A0 } from "../support/seed";
import { TIGHT, toBlock } from "./eventHarness";
import {
  addMonths,
  closedFormBalance,
  type RefLoan,
} from "./mortgageReference";
import { BASE, SEED_LOANS } from "./seedLoans";

const { runs: RUNS, timeout: TIMEOUT } = fcRuns(20261118, 200);

/** Engine opening balance at `base`, with the reset rate equal to the loan's own, so
 *  every payment so far is at the original rate. */
function engineOpening(l: RefLoan, base: string) {
  return openingBalance(toBlock(l), {
    ...A0,
    baseDate: isoDate(base),
    postFixationResetRatePa: rate(String(l.ratePa)),
  });
}

const gap = (l: RefLoan, base: string) =>
  engineOpening(l, base)
    .minus(closedFormBalance(l, base).toString())
    .abs()
    .toNumber();

describe("ADR 0235: replayed opening = closed form on ordinary loans", () => {
  for (const [id, loan] of Object.entries(SEED_LOANS)) {
    it(`${id}: at baseDate and at every month to 30 years on`, () => {
      expect(gap(loan, BASE)).toBeLessThanOrEqual(TIGHT);
      for (let m = 0; m <= 360; m += 1)
        expect(gap(loan, addMonths(loan.start, m))).toBeLessThanOrEqual(TIGHT);
    });
  }

  it(
    "random ordinary plain loans at a random date",
    () => {
      fc.assert(
        fc.property(
          fc.record({
            year: fc.integer({ min: 1995, max: 2026 }),
            month: fc.integer({ min: 1, max: 12 }),
            day: fc.integer({ min: 1, max: 31 }),
            principal: fc.integer({ min: 100, max: 20_000 }),
            bp: fc.integer({ min: 0, max: 900 }),
            years: fc.integer({ min: 5, max: 30 }),
            explicit: fc.boolean(),
            dp: fc.constantFrom(0, 2),
            fixation: fc.integer({ min: 1, max: 30 }),
            after: fc.integer({ min: 0, max: 420 }),
          }),
          (g) => {
            // Day 29–31 clamps to the month's end, February included.
            const pad = (n: number) => String(n).padStart(2, "0");
            const s = addMonths(`${g.year}-${pad(g.month)}-${pad(g.day)}`, 0);
            const ratePa = D(g.bp).div(10_000);
            const principal = D(g.principal).times(1000);
            const instalment = PMT(
              ratePa.div(12),
              g.years * 12,
              principal.negated(),
            ).toDecimalPlaces(g.dp, 0);
            const loan: RefLoan = {
              start: s,
              principal: principal.toString(),
              ratePa: ratePa.toString(),
              instalment: instalment.toString(),
              fixationMonths: g.fixation * 12,
              ...(g.explicit ? { termMonths: g.years * 12 } : {}),
            };
            expect(gap(loan, addMonths(s, g.after))).toBeLessThanOrEqual(TIGHT);
          },
        ),
        RUNS,
      );
    },
    TIMEOUT,
  );
});
