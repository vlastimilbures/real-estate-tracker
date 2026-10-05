// ADR 0109, ADR 0116: random plain and development loans with random prepayments and
// recasts, at a random baseDate, some with a rate shock or a successor block, agree with
// the independent reference model in every column, and conserve principal:
// Σ principal + Σ prepaid + final balance = opening debt + new debt (net of what a
// refinance paid off). The loans come from `loanGen.ts`.
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { D, type Decimal } from "../../../lib/money";
import { isoDate } from "../../dates";
import { openingBalance } from "../../schedule";
import type { AmortizationRow } from "../../types";
import { fcRuns } from "../support/fcRuns";
import { assumptions as A0 } from "../support/seed";
import { TIGHT, both, chainBoth, maxDev, sum, toBlock } from "./eventHarness";
import { type RefLoan } from "./mortgageReference";
import { isValid, loanWithEvents, shockOf } from "./loanGen";

// Fixed seed ⇒ reproducible in CI; nightly runs 2000 with a date seed (`fcRuns`).
// Hunt locally with FC_SEED=<n> FC_RUNS=<n>.
const { runs: RUNS, timeout: TIMEOUT } = fcRuns(20261003, 80);

/** Σ principal + Σ prepaid + final balance − opening − Σ new debt; zero when the
 *  balance is conserved. The final balance must not be negative. */
function leak(rows: AmortizationRow[], opening: Decimal) {
  const last = rows.at(-1)?.endBalance ?? D(0);
  expect(last.isNegative()).toBe(false);
  const newDebt = sum(rows, (x) => x.drawn.plus(x.refinanced));
  const repaid = sum(rows, (x) => x.principal.plus(x.prepaid));
  return repaid.plus(last).minus(opening).minus(newDebt).abs().toNumber();
}

/** Engine and reference for a refinance, compared row by row and per handover. */
function expectChainAgrees(
  e: ReturnType<typeof chainBoth>["e"],
  r: ReturnType<typeof chainBoth>["r"],
) {
  expect(maxDev(e.rows, r.rows, r.handovers)).toBeLessThanOrEqual(TIGHT);
  expect(e.refinances).toHaveLength(r.handovers.length);
  e.refinances.forEach((x, i) => {
    const h = r.handovers[i];
    expect(x.month).toBe(h.month);
    expect(
      x.paidOff.minus(h.paidOff.toString()).abs().toNumber(),
    ).toBeLessThanOrEqual(TIGHT);
    expect(
      x.drawn.minus(h.drawn.toString()).abs().toNumber(),
    ).toBeLessThanOrEqual(TIGHT);
  });
}

describe("ADR 0109: random loans with random events", () => {
  it(
    "agree with the reference to 1e-6 Kč and conserve principal",
    () => {
      fc.assert(
        fc.property(loanWithEvents, (g) => {
          fc.pre(isValid(g));
          const { loan, base, successor } = g;
          const { opts, extra } = shockOf(g);
          if (!successor) {
            const { e, r } = both(loan, base, opts, extra);
            expect(maxDev(e, r)).toBeLessThanOrEqual(TIGHT);
            const opening = openingBalance(toBlock(loan), {
              ...A0,
              baseDate: isoDate(base),
              ...extra,
            });
            expect(leak(e, opening)).toBeLessThanOrEqual(TIGHT);
            return;
          }
          // A refinance (D-47): compare the handovers too, and conserve from the first
          // row's opening balance.
          const { e, r } = chainBoth([loan, successor], base, opts, extra);
          expectChainAgrees(e, r);
          const first = e.rows[0];
          if (!first) return;
          const opening = first.endBalance
            .plus(first.principal)
            .plus(first.prepaid)
            .minus(first.drawn)
            .minus(first.refinanced);
          expect(leak(e.rows, opening)).toBeLessThanOrEqual(TIGHT);
        }),
        RUNS,
      );
    },
    TIMEOUT,
  );

  // ADR 0138 (#229): the 15,000 Kč tranche dated 08-01 lands in the handover month
  // (grid month 2, 08-07), whose owner payment is dropped; the successor pays off
  // 312,561.46 Kč, the tranche included.
  const loan229: RefLoan = {
    start: "2026-06-07",
    principal: 300000,
    ratePa: 0.005,
    instalment: 5064,
    fixationMonths: 12,
    termMonths: 120,
    draws: [{ date: "2026-08-01", amount: 15000 }],
  };
  const successor229: RefLoan = {
    start: "2026-08-06",
    principal: 90000,
    ratePa: 0.005,
    instalment: 1520,
    fixationMonths: 12,
  };
  it("#229: a tranche before the successor's start, payment dropped, is paid off", () => {
    const { e, r } = chainBoth([loan229, successor229], "2026-06-07");
    expectChainAgrees(e, r);
  });
});
