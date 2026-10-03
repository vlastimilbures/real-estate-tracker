// Explicit loan term, full-term schedule extension, and the closed-form
// amortization-health check (which must NOT walk the schedule — the refix
// re-amortization always zeroes the balance and masks a bad instalment).
import { describe, it, expect } from "vitest";
import {
  amortizationHealth,
  termMonths,
  scheduleMonths,
  drawMonth,
} from "../amortization";
import { buildSchedule } from "../schedule";
import { isoDate } from "../dates";
import { PMT } from "../../lib/money";
import { assumptions } from "./support/seed";
import type { MortgageBlock } from "../types";
import { rate } from "../brands";
import { money } from "../brands";

const block = (over: Partial<MortgageBlock> = {}): MortgageBlock => ({
  id: "m",
  propertyId: "p",
  startDate: isoDate("2026-09-01"),
  initialPrincipal: money("4000000"),
  fixationYears: 5,
  interestRatePa: rate("0.045"),
  monthlyInstalment: money("20266"),
  loanTermYears: 30,
  ...over,
});

describe("termMonths", () => {
  it("uses the explicit term when set", () => {
    expect(termMonths(block({ loanTermYears: 30 }))).toBe(360);
    expect(termMonths(block({ loanTermYears: 20 }))).toBe(240);
  });

  it("falls back to the NPER-derived term when unset (legacy)", () => {
    const b = block({ loanTermYears: undefined });
    expect(termMonths(b)).toBeGreaterThan(0);
  });
});

describe("amortizationHealth", () => {
  it("suggests the amortizing instalment (PMT over the term)", () => {
    const b = block({ monthlyInstalment: money("1") });
    const expected = PMT(
      b.interestRatePa.div(12),
      360,
      b.initialPrincipal.negated(),
    );
    expect(amortizationHealth(b).suggestedInstalment.toNumber()).toBeCloseTo(
      expected.toNumber(),
      2,
    );
  });

  it("flags an instalment that is too low to retire the loan by term", () => {
    const h = amortizationHealth(block({ monthlyInstalment: money("18000") }));
    expect(h.fullyAmortizes).toBe(false);
    expect(h.shortfall.toNumber()).toBeGreaterThan(1);
  });

  it("flags an instalment that does not even cover the first month's interest", () => {
    // 4,000,000 × 0.045/12 = 15,000 interest; 14,000 < that → never amortizes
    const h = amortizationHealth(block({ monthlyInstalment: money("14000") }));
    expect(h.fullyAmortizes).toBe(false);
  });

  it("passes a correct (amortizing) instalment", () => {
    const suggested = amortizationHealth(block()).suggestedInstalment;
    const h = amortizationHealth(
      block({ monthlyInstalment: money(suggested) }),
    );
    expect(h.fullyAmortizes).toBe(true);
    expect(h.shortfall.abs().toNumber()).toBeLessThanOrEqual(1);
  });

  it("never warns for a legacy loan whose term is derived from the instalment", () => {
    const h = amortizationHealth(
      block({ loanTermYears: undefined, monthlyInstalment: money("18000") }),
    );
    expect(h.fullyAmortizes).toBe(true);
  });
});

describe("schedule extends to the loan's full term", () => {
  it("amortizes a future 30-yr loan to ~zero at its term end, past the horizon", () => {
    // rate (3.9%) ≠ post-fixation reset (4.5%) so the schedule re-amortizes at refix;
    // payoff timing is term-driven and must still land on a zero balance.
    const base = block({ interestRatePa: rate("0.039") });
    const b = {
      ...base,
      monthlyInstalment: money(amortizationHealth(base).suggestedInstalment),
    };
    const sched = buildSchedule(b, assumptions);
    expect(b.interestRatePa.equals(assumptions.postFixationResetRatePa)).toBe(
      false,
    );
    // schedule runs past the 360-month horizon because the loan is drawn ~3 months late
    expect(sched.length).toBeGreaterThan(assumptions.horizonYears * 12);
    expect(sched.length).toBe(scheduleMonths(b, assumptions));
    // term payments begin the month after the draw, so the loan needs drawMonth+term rows
    expect(sched.length).toBe(
      drawMonth(b, assumptions.baseDate) + termMonths(b),
    );
    const last = sched[sched.length - 1];
    expect(last.endBalance.toNumber()).toBeCloseTo(0, 2);
  });
});
