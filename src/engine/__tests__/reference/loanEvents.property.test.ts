// ADR 0109, ADR 0116: random plain and development loans with random prepayments and a
// random recast, at a random baseDate, agree with the independent reference model in
// every column, and conserve principal from the engine's opening balance:
// Σ principal + Σ prepaid + final balance = opening debt + new debt. Some prepayments
// fall just before baseDate, so the late window (ADR 0116 §1) is covered.
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { D, PMT } from "../../../lib/money";
import { isoDate } from "../../dates";
import { openingBalance } from "../../schedule";
import { assumptions as A0 } from "../support/seed";
import { addMonths, termOf, type RefLoan } from "./mortgageReference";
import { TIGHT, both, maxDev, sum, toBlock } from "./eventHarness";

// Fixed seed ⇒ reproducible in CI. Hunt locally with FC_SEED=<n> FC_RUNS=<n>.
const RUNS = {
  seed: Number(process.env.FC_SEED ?? 20261003),
  numRuns: Number(process.env.FC_RUNS ?? 80),
};
const BASE = "2026-06-07";

const daysBefore = (iso: string, days: number) =>
  new Date(Date.parse(iso) - days * 86_400_000).toISOString().slice(0, 10);
const share = fc.double({ min: 0, max: 1, noNaN: true });

/** Development terms: tranches after the start, completion at the last one. */
const devTerms = fc.option(
  fc.record({
    termMonths: fc.integer({ min: 120, max: 360 }),
    tranches: fc.array(
      fc.record({
        month: fc.integer({ min: 1, max: 30 }),
        day: fc.integer({ min: 1, max: 28 }),
        size: fc.double({ min: 0.05, max: 1, noNaN: true }),
      }),
      { minLength: 1, maxLength: 2 },
    ),
  }),
  { nil: undefined },
);

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
    dev: devTerms,
    baseShift: fc.integer({ min: -400, max: 400 }),
    late: fc.option(
      fc.record({
        days: fc.integer({ min: 0, max: 30 }),
        size: fc.double({ min: 0.01, max: 0.3, noNaN: true }),
        shorten: fc.boolean(),
      }),
      { nil: undefined },
    ),
  })
  .map((g): { loan: RefLoan; base: string } => {
    const base = daysBefore(BASE, -g.baseShift);
    const start = addMonths(BASE, g.startOffset);
    const r = D(g.bp).div(10_000);
    const instalment = PMT(r.div(12), g.months, D(-g.principal))
      .ceil()
      .toString();
    const draws = g.dev?.tranches
      .map((t) => ({
        date:
          addMonths(start, t.month).slice(0, 8) +
          String(t.day).padStart(2, "0"),
        amount: String(Math.round(t.size * g.principal)),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
    const loan: RefLoan = {
      start,
      principal: String(g.principal),
      ratePa: r.toString(),
      instalment,
      fixationMonths: g.fixationYears * 12,
      ...(g.dev && draws
        ? {
            termMonths: g.dev.termMonths,
            draws,
            completion: draws[draws.length - 1].date,
          }
        : {}),
    };
    const term = termOf(loan);
    /** A payment number from 1 to term − 1. */
    const payment = (at: number) => 1 + Math.floor(at * (term - 2));
    const effect = (shorten: boolean) =>
      shorten ? ("shortenTerm" as const) : ("lowerInstalment" as const);
    const prepayments = g.prepays.map((p) => ({
      date: daysBefore(addMonths(start, payment(p.at)), p.early),
      amount: String(Math.round(p.size * g.principal)),
      effect: effect(p.shorten),
    }));
    // A prepayment just before baseDate: inside the loan, often in the late window.
    const lateDate = g.late ? daysBefore(base, g.late.days) : null;
    if (
      g.late &&
      lateDate &&
      lateDate > start &&
      lateDate < addMonths(start, term)
    )
      prepayments.push({
        date: lateDate,
        amount: String(Math.round(g.late.size * g.principal)),
        effect: effect(g.late.shorten),
      });
    prepayments.sort((a, b) => a.date.localeCompare(b.date));
    if (!g.recast) return { loan: { ...loan, prepayments }, base };
    // A development loan's last tranche lands on payment `landed` at the latest: an
    // instalment recast must be dated after it, a maturity must follow it (ADR 0116).
    const landed = g.dev
      ? Math.max(...g.dev.tranches.map((t) => t.month)) + 1
      : 0;
    const k = Math.max(payment(g.recast.at), landed);
    const date = addMonths(start, k);
    const lo = Math.max(k, landed) + 1;
    const recast = g.recast.toMaturity
      ? {
          date,
          maturity: addMonths(start, lo + Math.floor(g.recast.x * (599 - lo))),
        }
      : {
          date,
          instalment: String(
            Math.round((0.4 + g.recast.x) * Number(instalment)),
          ),
        };
    return { loan: { ...loan, prepayments, recasts: [recast] }, base };
  });

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
