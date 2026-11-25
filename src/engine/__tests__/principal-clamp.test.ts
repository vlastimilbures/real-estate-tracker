// #477 item 9: the month-step kernel clamps a negative principal to 0 (`splitPayment` in
// loan/kernel.ts), which only an instalment below the month's interest would reach. This
// pins the invariant that makes the clamp look unreachable: on every schedule row the
// instalment covers the interest, for the fixtures and for random plain and development
// loans with prepayments, recasts, rate shocks and successors. The clamp stays (owner,
// 2026-11-25); this test is the evidence for any later decision, with the mutation run.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { isoDate } from "../dates";
import { propertySchedules } from "../schedule";
import type { AmortizationRow, Assumptions, Portfolio } from "../types";
import { fcRuns } from "./support/fcRuns";
import { assumptions, portfolio as seed } from "./support/seed";
import { mixed } from "./support/mixed";
import { mixedCashOutside, mixedWithRefi } from "./support/synthetic";
import { withEvents } from "./support/events";
import { isValid, loanWithEvents, shockOf } from "./reference/loanGen";
import { toBlock } from "./reference/eventHarness";

const { runs: RUNS, timeout: TIMEOUT } = fcRuns(4779, 150);

/** The rows whose instalment is below the month's interest (none expected). */
function underInterest(rows: AmortizationRow[]): AmortizationRow[] {
  return rows.filter((r) => r.instalment.lessThan(r.interest));
}

function allRows(p: Portfolio, a: Assumptions): AmortizationRow[] {
  const ids = p.properties.map((x) => x.id);
  return [...propertySchedules(p.mortgages, ids, a).values()].flatMap(
    (s) => s.rows,
  );
}

describe("the instalment covers the month's interest (kernel clamp, #477)", () => {
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
