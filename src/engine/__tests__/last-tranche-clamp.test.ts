// ADR 0139 (#218): a projection tranche lands no later than payment term−1. Development
// loan from 31 Jan 2026 over 24 months; the last valid draw is on payment 23's due date,
// 31 Dec 2027 (ADR 0129 §3). A baseDate on the 28th or 30th dates the grid row carrying
// payment 23 before that due date; the tranche must still join that row, not the final
// payment (which would repay 504,359.06 in one shot).
import { describe, it, expect } from "vitest";
import { isoDate } from "../dates";
import { buildSchedule } from "../schedule";
import type { AmortizationRow } from "../types";
import type { RefLoan } from "./reference/mortgageReference";
import { both, maxDev, sum, TIGHT, toBlock } from "./reference/eventHarness";
import { assumptions } from "./support/seed";

const loan: RefLoan = {
  start: "2026-01-31",
  principal: 100000,
  ratePa: 0.05,
  instalment: 0,
  fixationMonths: 60,
  termMonths: 24,
  draws: [{ date: "2027-12-31", amount: 500000 }],
};
const at = (base: string) => ({ ...assumptions, baseDate: isoDate(base) });
const paid = (r: AmortizationRow) => r.interest.plus(r.principal);

// baseDate, grid month carrying payment 23, its grid date.
const CASES: [string, number, string][] = [
  ["2026-02-28", 22, "2027-12-28"],
  ["2026-04-30", 20, "2027-12-30"],
  // Regression guard, cap inactive: a future loan draws in grid month 1, so the grid
  // month carrying payment 23 (month 24) is never dated before its due date.
  ["2025-12-31", 24, "2027-12-31"],
];

describe("ADR 0139: the last tranche joins payment term−1", () => {
  for (const [base, month, date] of CASES) {
    it(`baseDate ${base}: grid month ${month} (${date}) draws the tranche`, () => {
      const rows = buildSchedule(toBlock(loan), at(base));
      const drawn = rows.filter((r) => r.drawn.greaterThan(0));
      expect(drawn.map((r) => r.month)).toEqual(
        base < loan.start ? [1, month] : [month],
      );
      const row23 = rows[month - 1];
      expect(row23.date).toEqual(isoDate(date));
      expect(row23.drawn.toNumber()).toBe(500000);
      // The final payment is one annuity payment, like payment 23, and clears the loan.
      const last = rows[month];
      expect(last.endBalance.isZero()).toBe(true);
      expect(rows.slice(month + 1).every((r) => paid(r).isZero())).toBe(true);
      expect(Math.abs(paid(last).minus(paid(row23)).toNumber())).toBeLessThan(
        0.01,
      );
      expect(last.principal.lessThan(300000)).toBe(true);
      // Σ principal retires the debt opened and drawn on the grid.
      const opened = rows[0].endBalance
        .plus(rows[0].principal)
        .minus(rows[0].drawn);
      expect(
        sum(rows, (r) => r.principal)
          .minus(opened.plus(sum(rows, (r) => r.drawn)))
          .abs()
          .toNumber(),
      ).toBeLessThan(1e-6);
    });

    it(`baseDate ${base}: the engine matches the reference`, () => {
      const { e, r } = both(loan, base);
      expect(maxDev(e, r)).toBeLessThanOrEqual(TIGHT);
    });
  }
});
