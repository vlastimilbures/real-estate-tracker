// #477 item 9: the month-step kernel clamps a negative principal to 0 (`splitPayment` in
// loan/kernel.ts), which an instalment below the month's interest reaches. For
// generator-shaped inputs (an instalment at least the annuity: the fixtures, and random
// plain and development loans with prepayments, recasts, rate shocks and successors) the
// clamp never fires: on every row the instalment covers the interest. It does fire for
// a stored plain loan with an explicit term and an instalment at or below the first
// month's interest, pinned below as today's behaviour (#597, ADR 0264: such a loan is
// refused on save and import, but one stored before still loads; debt #611). The clamp
// stays (owner, 2026-11-25).
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { D, Decimal } from "../../lib/money";
import { isoDate } from "../dates";
import { money, rate } from "../brands";
import { instalmentBelowInterest, validateInputs } from "../validate";
import { propertySchedules } from "../schedule";
import type { AmortizationRow, Assumptions, Portfolio } from "../types";
import { fcRuns } from "./support/fcRuns";
import { assumptions, portfolio as seed } from "./support/seed";
import { mixed } from "./support/mixed";
import { mixedCashOutside, mixedWithRefi } from "./support/synthetic";
import { withEvents } from "./support/events";
import {
  isValid,
  loanWithEvents,
  share,
  shockOf,
  type RandomLoan,
} from "./reference/loanGen";
import { toBlock } from "./reference/eventHarness";
import { withLoan } from "./support/loan";

const { runs: RUNS, timeout: TIMEOUT } = fcRuns(4779, 150);

/** The rows whose instalment is below the month's interest. */
function underInterest(rows: AmortizationRow[]): AmortizationRow[] {
  return rows.filter((r) => r.instalment.lessThan(r.interest));
}

function allRows(p: Portfolio, a: Assumptions): AmortizationRow[] {
  const ids = p.properties.map((x) => x.id);
  return [...propertySchedules(p.mortgages, ids, a).values()].flatMap(
    (s) => s.rows,
  );
}

describe("for generator-shaped inputs the instalment covers the month's interest (kernel clamp, #477)", () => {
  it.each([
    ["seed", seed],
    ["mixed", mixed],
    ["mixed with a refinance", mixedWithRefi],
    ["mixed with cash outside", mixedCashOutside],
    ["seed with events", withEvents(seed)],
    ["mixed with events", withEvents(mixed)],
    ["refinance with events", withEvents(mixedWithRefi)],
  ])("on every row of the %s fixture", (_name, p) => {
    const rows = allRows(p, assumptions);
    expect(rows.length).toBeGreaterThan(0);
    expect(underInterest(rows)).toEqual([]);
  });

  it(
    "on every row of random loans with events, shocks and successors",
    () => {
      fc.assert(
        fc.property(loanWithEvents, (g) => {
          fc.pre(isValid(g));
          const blocks = [toBlock(g.loan, "b", "p")];
          if (g.successor) blocks.push(toBlock(g.successor, "s", "p"));
          const a: Assumptions = {
            ...assumptions,
            baseDate: isoDate(g.base),
            ...shockOf(g).extra,
          };
          const rows = propertySchedules(blocks, ["p"], a).get("p")?.rows ?? [];
          expect(underInterest(rows)).toEqual([]);
        }),
        RUNS,
      );
    },
    TIMEOUT,
  );
});

/** A plain loan with a term: no draws, no completion date. */
const plainWithTerm = (g: RandomLoan) =>
  g.loan.termMonths != null && !g.loan.draws && !g.loan.completion;
/** Where in [first interest, 1.1 × annuity] the instalment lies, skewed to the bottom. */
const nearInterest = share.map((s) => s * s);

// ADR 0264 §1: the rule checks only the first month at the block's own rate. Any
// instalment it lets through, from 1 haléř above that interest to above the annuity,
// keeps every row's instalment at or above its interest, with prepayments, recasts,
// shocks and successors: the balance falls in the fixation, and each reset re-amortizes.
describe("a plain loan with a term that passes the instalment rule never reaches the clamp (ADR 0264)", () => {
  it(
    "on every row of random loans with events, shocks and successors",
    () => {
      fc.assert(
        fc.property(
          loanWithEvents.filter(plainWithTerm),
          nearInterest,
          (g0, x) => {
            const first = D(g0.loan.principal).times(g0.loan.ratePa).div(12);
            const top = D(g0.loan.instalment).times("1.1");
            // Above the first interest by at least 1 haléř (x = 0), up to 1.1 × the annuity.
            const instalment = first
              .plus(top.minus(first).times(x))
              .toDecimalPlaces(2, Decimal.ROUND_DOWN)
              .plus("0.01");
            const g = {
              ...g0,
              loan: { ...g0.loan, instalment: String(instalment) },
            };
            const block = toBlock(g.loan, "b", "p");
            fc.pre(isValid(g) && instalmentBelowInterest(block) === undefined);
            const blocks = [block];
            if (g.successor) blocks.push(toBlock(g.successor, "s", "p"));
            const a: Assumptions = {
              ...assumptions,
              baseDate: isoDate(g.base),
              ...shockOf(g).extra,
            };
            const rows =
              propertySchedules(blocks, ["p"], a).get("p")?.rows ?? [];
            expect(underInterest(rows)).toEqual([]);
          },
        ),
        RUNS,
      );
    },
    TIMEOUT,
  );
});

// Today's behaviour, known wrong (#597, debt #611): a plain loan with an explicit term and
// an instalment at or below the first month's interest is refused on save and import
// since ADR 0264, but one stored before it still loads, and until the fixation reset each
// row clamps the principal to 0, so the balance stays flat and the interest is neither
// paid nor capitalised. At the reset the instalment re-amortizes and the clamp stops.
// Asserted as it is today (owner decision 2 on #597).
describe("an explicit-term loan paying less than the interest (#597, today's behaviour)", () => {
  const start = isoDate("2026-07-15");
  const p = withLoan({
    startDate: start,
    initialPrincipal: money("3000000"),
    interestRatePa: rate("0.05"),
    fixationYears: 3,
    loanTermYears: 30,
    monthlyInstalment: money("1000"),
  });
  const rows = allRows(p, assumptions);
  // Grid month 1 is undrawn and month 2 draws (no payment); payments 1..36 (grid months
  // 3..38) are at the fixed 5 %, payment 36 due on the fixation end 2029-07-15 still
  // fixed (D-21). Payment 37 is the first at the 4.5 % reset rate.
  const fixed = rows.slice(2, 38);
  const after = rows.slice(38);

  it("is accepted by validateInputs", () => {
    expect(validateInputs(p, assumptions)).toEqual([]);
  });

  it("pays no principal and keeps the balance flat on every fixed-rate row", () => {
    expect(fixed).toHaveLength(36);
    for (const r of fixed) {
      expect(r.instalment.toFixed()).toBe("1000");
      expect(r.interest.toFixed()).toBe("12500");
      expect(r.principal.isZero()).toBe(true);
      expect(r.endBalance.toFixed()).toBe("3000000");
    }
    expect(underInterest(rows)).toEqual(fixed);
  });

  it("re-amortizes at the reset, after which the clamp no longer fires", () => {
    expect(after.length).toBeGreaterThan(0);
    const first = after[0]!;
    expect(first.ratePa.toFixed()).toBe("0.045");
    expect(first.dueDate?.toISOString().slice(0, 10)).toBe("2029-08-15");
    expect(first.instalment.toFixed(2)).toBe("16011.61");
    expect(first.principal.greaterThan(0)).toBe(true);
    expect(first.endBalance.lessThan(3000000)).toBe(true);
    expect(underInterest(after)).toEqual([]);
  });
});
