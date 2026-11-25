// #477 item 9: the month-step kernel clamps a negative principal to 0 (`splitPayment` in
// loan/kernel.ts), which an instalment below the month's interest reaches. For
// generator-shaped inputs (an instalment at least the annuity: the fixtures, and random
// plain and development loans with prepayments, recasts, rate shocks and successors) the
// clamp never fires: on every row the instalment covers the interest. It does fire for
// an accepted plain loan with an explicit term and an instalment at or below the first
// month's interest, pinned below as today's behaviour (#597, an owner decision via ADR).
// The clamp stays (owner, 2026-11-25).
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { isoDate } from "../dates";
import { money, rate } from "../brands";
import { validateInputs } from "../validate";
import { propertySchedules } from "../schedule";
import type { AmortizationRow, Assumptions, Portfolio } from "../types";
import { fcRuns } from "./support/fcRuns";
import { assumptions, portfolio as seed } from "./support/seed";
import { mixed } from "./support/mixed";
import { mixedCashOutside, mixedWithRefi } from "./support/synthetic";
import { withEvents } from "./support/events";
import { isValid, loanWithEvents, shockOf } from "./reference/loanGen";
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

// Today's behaviour, known wrong (#597): a plain loan with an explicit term and an
// instalment at or below the first month's interest is accepted, and until the fixation
// reset each row clamps the principal to 0, so the balance stays flat and the interest is
// neither paid nor capitalised. At the reset the instalment re-amortizes and the clamp
// stops. Asserted as it is today; the fix needs the owner's ADR.
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
