// ADR 0109: random plain loans with random prepayments and a random recast agree with
// the independent reference model in every column, and conserve principal:
// Σ principal + Σ prepaid + final balance = opening debt + new debt.
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { D, PMT } from "../../../lib/money";
import { addMonths, termOf, type RefLoan } from "./mortgageReference";
import { TIGHT, both, maxDev, sum } from "./eventHarness";

// Fixed seed ⇒ reproducible in CI. Hunt locally with FC_SEED=<n> FC_RUNS=<n>.
const RUNS = {
  seed: Number(process.env.FC_SEED ?? 20261003),
  numRuns: Number(process.env.FC_RUNS ?? 80),
};
const BASE = "2026-06-07";

const daysBefore = (iso: string, days: number) =>
  new Date(Date.parse(iso) - days * 86_400_000).toISOString().slice(0, 10);
const share = fc.double({ min: 0, max: 1, noNaN: true });

const loanWithEvents = fc
  .record({
    bp: fc.integer({ min: 50, max: 900 }),
    principal: fc.integer({ min: 300_000, max: 8_000_000 }),
    months: fc.integer({ min: 60, max: 360 }),
    fixationYears: fc.integer({ min: 1, max: 10 }),
    startOffset: fc.integer({ min: -180, max: 24 }),
    prepays: fc.array(
      fc.record({
        at: share,
        size: fc.double({ min: 0.01, max: 0.7, noNaN: true }),
        shorten: fc.boolean(),
        early: fc.integer({ min: 0, max: 20 }),
      }),
      { maxLength: 3 },
    ),
    recast: fc.option(
      fc.record({ at: share, toMaturity: fc.boolean(), x: share }),
      { nil: undefined },
    ),
  })
  .map((g): RefLoan => {
    const start = addMonths(BASE, g.startOffset);
    const r = D(g.bp).div(10_000);
    const instalment = PMT(r.div(12), g.months, D(-g.principal))
      .ceil()
      .toString();
    const loan: RefLoan = {
      start,
      principal: String(g.principal),
      ratePa: r.toString(),
      instalment,
      fixationMonths: g.fixationYears * 12,
    };
    const term = termOf(loan);
    /** A payment number from 1 to term − 1. */
    const payment = (at: number) => 1 + Math.floor(at * (term - 2));
    const prepayments = g.prepays.map((p) => ({
      date: daysBefore(addMonths(start, payment(p.at)), p.early),
      amount: String(Math.round(p.size * g.principal)),
      effect: p.shorten
        ? ("shortenTerm" as const)
        : ("lowerInstalment" as const),
    }));
    if (!g.recast) return { ...loan, prepayments };
    const k = payment(g.recast.at);
    const date = addMonths(start, k);
    const recast = g.recast.toMaturity
      ? {
          date,
          maturity: addMonths(
            start,
            k + 1 + Math.floor(g.recast.x * (599 - k)),
          ),
        }
      : {
          date,
          instalment: String(
            Math.round((0.4 + g.recast.x) * Number(instalment)),
          ),
        };
    return { ...loan, prepayments, recasts: [recast] };
  });

describe("ADR 0109: random loans with random events", () => {
  it("agree with the reference to 1e-6 Kč and conserve principal", () => {
    fc.assert(
      fc.property(loanWithEvents, (loan) => {
        const { e, r } = both(loan);
        expect(maxDev(e, r)).toBeLessThanOrEqual(TIGHT);
        const first = e[0];
        const opening = first.endBalance
          .plus(first.principal)
          .plus(first.prepaid)
          .minus(first.drawn);
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
