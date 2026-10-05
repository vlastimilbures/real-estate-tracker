// ADR 0109, ADR 0116: random plain and development loans with random prepayments and a
// random recast, at a random baseDate, agree with the independent reference model in
// every column, and conserve principal from the engine's opening balance:
// Σ principal + Σ prepaid + final balance = opening debt + new debt. The loans come from
// `loanGen.ts`.
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { D } from "../../../lib/money";
import { isoDate } from "../../dates";
import { openingBalance } from "../../schedule";
import { assumptions as A0 } from "../support/seed";
import { TIGHT, both, maxDev, sum, toBlock } from "./eventHarness";
import { loanWithEvents } from "./loanGen";

// Fixed seed ⇒ reproducible in CI. Hunt locally with FC_SEED=<n> FC_RUNS=<n>.
const RUNS = {
  seed: Number(process.env.FC_SEED ?? 20261003),
  numRuns: Number(process.env.FC_RUNS ?? 80),
};

describe("ADR 0109: random loans with random events", () => {
  it("agree with the reference to 1e-6 Kč and conserve principal", () => {
    fc.assert(
      fc.property(loanWithEvents, ({ loan, base }) => {
        const { e, r } = both(loan, base);
        expect(maxDev(e, r)).toBeLessThanOrEqual(TIGHT);
        const opening = openingBalance(toBlock(loan), {
          ...A0,
          baseDate: isoDate(base),
        });
        const newDebt = sum(e, (x) => x.drawn);
        const repaid = sum(e, (x) => x.principal.plus(x.prepaid));
        const last = e.at(-1)?.endBalance ?? D(0);
        expect(last.isNegative()).toBe(false);
        expect(
          repaid.plus(last).minus(opening).minus(newDebt).abs().toNumber(),
        ).toBeLessThanOrEqual(TIGHT);
      }),
      RUNS,
    );
  }, 60_000);
});
