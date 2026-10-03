// Development-loan amortization: gradual tranche draws + interest-only-until-completion.
// The plain-loan parity is covered by amortization.test.ts; here we exercise the
// dev path that fires only when `draws` or `completionDate` are present.
import { describe, it, expect } from "vitest";
import { instalmentFor, isDevLoan, termMonths } from "../amortization";
import { buildSchedule, balanceAtMonth } from "../schedule";
import { EngineInputError } from "../errors";
import { portfolioProjection } from "../projections";
import { portfolioKpis } from "../kpis";
import { D, PMT } from "../../lib/money";
import { isoDate } from "../dates";
import { assumptions } from "./support/seed";
import type { MortgageBlock, Portfolio } from "../types";
import { KC } from "./support/tolerance";
import { rate } from "../brands";
import { money } from "../brands";

const sumPrincipal = (
  rows: { principal: import("../../lib/money").Decimal }[],
) => rows.reduce((s, r) => s.plus(r.principal), D("0"));

// A future-start construction loan: drawn 2026-09, two tranches, interest-only until
// completion 2027-12, then re-amortizes over the remaining term to startDate+30y.
const devFuture: MortgageBlock = {
  id: "dev-future",
  propertyId: "javorova",
  startDate: isoDate("2026-09-01"),
  initialPrincipal: money("2000000"),
  fixationYears: 10,
  interestRatePa: rate("0.05"),
  monthlyInstalment: money("10000"), // ignored while interest-only
  loanTermYears: 30,
  draws: [
    { date: isoDate("2027-03-01"), amount: money("1500000") },
    { date: isoDate("2027-09-01"), amount: money("2000000") },
  ],
  completionDate: isoDate("2027-12-01"),
};
const TOTAL_DRAWN = 5_500_000; // 2.0M + 1.5M + 2.0M

describe("isDevLoan gate", () => {
  it("is true with draws or a completion date, false otherwise", () => {
    expect(isDevLoan(devFuture)).toBe(true);
    expect(
      isDevLoan({ ...devFuture, draws: undefined, completionDate: undefined }),
    ).toBe(false);
    expect(
      isDevLoan({
        ...devFuture,
        draws: [],
        completionDate: isoDate("2027-01-01"),
      }),
    ).toBe(true);
  });
});

describe("termMonths — dev loan must carry an explicit term", () => {
  it("throws when a dev loan omits loanTermYears (no silent NaN/zero-length schedule)", () => {
    const noTerm = {
      ...devFuture,
      loanTermYears: undefined,
    } as unknown as MortgageBlock; // deliberately invalid (DR-051)
    expect(isDevLoan(noTerm)).toBe(true);
    expect(() => termMonths(noTerm)).toThrow(EngineInputError);
    expect(() => termMonths(noTerm)).toThrow(/MISSING_TERM_FOR_DEV_LOAN/);
    expect(() => buildSchedule(noTerm, assumptions)).toThrow(
      /MISSING_TERM_FOR_DEV_LOAN/,
    );
  });

  it("does not throw once a term is supplied", () => {
    expect(() => termMonths(devFuture)).not.toThrow();
    expect(termMonths(devFuture)).toBe(360);
  });
});

describe("Development loan — gradual utilization + interest-only", () => {
  const schedule = buildSchedule(devFuture, assumptions);
  const at = (iso: string) =>
    schedule.find((r) => r.date.getTime() === isoDate(iso).getTime())!;

  it("Σ principal over the full schedule equals the total drawn (the dev tripwire)", () => {
    expect(
      Math.abs(sumPrincipal(schedule).toNumber() - TOTAL_DRAWN),
    ).toBeLessThanOrEqual(KC);
  });

  it("fully amortizes by the end of the schedule", () => {
    expect(
      Math.abs(schedule.at(-1)!.endBalance.toNumber()),
    ).toBeLessThanOrEqual(KC);
  });

  it("interest-only months pay interest only and don't reduce the balance", () => {
    // 2027-06 is after the first tranche (balance 3.5M) and before completion.
    const r = at("2027-06-07");
    expect(r.principal.toNumber()).toBe(0);
    expect(r.instalment.toString()).toBe(r.interest.toString());
    // balance reflects the draws so far: 2.0M + 1.5M = 3.5M (2027-09 not yet drawn).
    expect(Math.abs(r.endBalance.toNumber() - 3_500_000)).toBeLessThanOrEqual(
      KC,
    );
    expect(
      Math.abs(r.interest.toNumber() - (3_500_000 * 0.05) / 12),
    ).toBeLessThanOrEqual(0.01);
  });

  it("a tranche lands as an interest-only balance jump (no principal that month)", () => {
    const before = at("2027-08-07").endBalance.toNumber(); // 3.5M
    const after = at("2027-09-07").endBalance.toNumber(); // +2.0M tranche, still IO
    expect(Math.abs(after - before - 2_000_000)).toBeLessThanOrEqual(KC);
    expect(at("2027-09-07").principal.toNumber()).toBe(0);
  });

  it("re-amortizes the first month after completion (principal turns positive)", () => {
    const lastIo = at("2027-12-07"); // <= completion 2027-12-01? no — see note below
    // Completion is 2027-12-01; the grid month dated 2027-12-07 is AFTER it, so it is
    // the first amortizing month. The prior month (2027-11-07) is the last IO month.
    expect(at("2027-11-07").principal.toNumber()).toBe(0);
    expect(lastIo.principal.toNumber()).toBeGreaterThan(0);
  });
});

describe("Development loan — post-completion tranche re-amortizes the instalment", () => {
  // Completion early (2026-12), then a tranche after completion (2027-06) must bump the
  // instalment to PMT(rate, remaining term, post-draw balance).
  const block: MortgageBlock = {
    id: "dev-post",
    propertyId: "javorova",
    startDate: isoDate("2026-07-01"),
    initialPrincipal: money("2000000"),
    fixationYears: 10,
    interestRatePa: rate("0.05"),
    monthlyInstalment: money("10000"),
    loanTermYears: 30,
    draws: [{ date: isoDate("2027-06-01"), amount: money("1000000") }],
    completionDate: isoDate("2026-12-01"),
  };
  const schedule = buildSchedule(block, assumptions);
  const idx = (iso: string) =>
    schedule.findIndex((r) => r.date.getTime() === isoDate(iso).getTime());

  it("the instalment steps up at the post-completion tranche", () => {
    const i = idx("2027-06-07");
    expect(schedule[i].instalment.toNumber()).toBeGreaterThan(
      schedule[i - 1].instalment.toNumber(),
    );
  });

  it("the new instalment equals PMT over the remaining term on the post-draw balance", () => {
    const i = idx("2027-06-07");
    const startBalance = schedule[i].endBalance.plus(schedule[i].principal); // post-draw balance
    // Remaining term = 360 − monthsBetween(startDate, baseDate) − (m − 1); m = i + 1.
    const term = 360;
    const startToBase = -1; // startDate 2026-07-01 is ~1 month after baseDate 2026-06-07
    const remaining = term - startToBase - (schedule[i].month - 1);
    const expected = PMT(D("0.05").div(12), remaining, startBalance.negated());
    expect(
      Math.abs(schedule[i].instalment.toNumber() - expected.toNumber()),
    ).toBeLessThanOrEqual(KC);
  });

  it("still fully amortizes (Σ principal = total drawn = 3.0M)", () => {
    expect(
      Math.abs(sumPrincipal(schedule).toNumber() - 3_000_000),
    ).toBeLessThanOrEqual(KC);
  });
});

describe("Development loan — already running at baseDate (opening balance)", () => {
  // Started 2025-01, interest-only until 2026-09, a tranche before baseDate and one
  // after. At baseDate (2026-06-07) only interest has been paid, so the opening balance
  // is the draws to date: 1.0M initial + 1.0M (2025-07) = 2.0M.
  const block: MortgageBlock = {
    id: "dev-running",
    propertyId: "javorova",
    startDate: isoDate("2025-01-01"),
    initialPrincipal: money("1000000"),
    fixationYears: 10,
    interestRatePa: rate("0.05"),
    monthlyInstalment: money("8000"),
    loanTermYears: 30,
    draws: [
      { date: isoDate("2025-07-01"), amount: money("1000000") },
      { date: isoDate("2026-12-01"), amount: money("1000000") },
    ],
    completionDate: isoDate("2026-09-01"),
  };
  const schedule = buildSchedule(block, assumptions);

  it("opening balance folds in the draws drawn before baseDate (no principal paid yet)", () => {
    expect(
      Math.abs(balanceAtMonth(schedule, 0).toNumber() - 2_000_000),
    ).toBeLessThanOrEqual(KC);
  });

  it("Σ principal over the full schedule equals the total drawn (3.0M)", () => {
    expect(
      Math.abs(sumPrincipal(schedule).toNumber() - 3_000_000),
    ).toBeLessThanOrEqual(KC);
  });
});

// A temporary rate shock re-amortizes the dev schedule a second time, interleaved with
// tranche draws and the interest-only window — the most entangled trigger path. The
// invariant must still hold: each re-amort targets startDate+term, so Σ principal over
// the schedule equals the total drawn and the balance reaches zero.
describe("Development loan — under a temporary rate shock", () => {
  const shocked = {
    ...assumptions,
    rateShock: { deltaPa: rate("0.04"), durationYears: 3 },
  };

  it("future-start dev loan still amortizes to the total drawn (buildDevSchedule path)", () => {
    const schedule = buildSchedule(devFuture, shocked);
    expect(
      Math.abs(sumPrincipal(schedule).toNumber() - TOTAL_DRAWN),
    ).toBeLessThanOrEqual(KC);
    expect(
      Math.abs(schedule.at(-1)!.endBalance.toNumber()),
    ).toBeLessThanOrEqual(KC);
  });

  it("running-at-baseDate dev loan still amortizes to the total drawn (simulate path)", () => {
    const running: MortgageBlock = {
      id: "dev-running-shock",
      propertyId: "javorova",
      startDate: isoDate("2025-01-01"),
      initialPrincipal: money("1000000"),
      fixationYears: 10,
      interestRatePa: rate("0.05"),
      monthlyInstalment: money("8000"),
      loanTermYears: 30,
      draws: [{ date: isoDate("2025-07-01"), amount: money("1000000") }],
      completionDate: isoDate("2026-09-01"),
    };
    const schedule = buildSchedule(running, shocked);
    expect(
      Math.abs(sumPrincipal(schedule).toNumber() - 2_000_000),
    ).toBeLessThanOrEqual(KC);
    expect(
      Math.abs(schedule.at(-1)!.endBalance.toNumber()),
    ).toBeLessThanOrEqual(KC);
  });
});

// Confirmatory: a dev loan is correct where users actually see it — through the
// month-indexed year-slicing of propertyProjection/portfolioKpis, which the direct
// buildSchedule tests above bypass.
describe("Development loan — through the projection path", () => {
  /** A one-property portfolio (owned at baseDate) carrying the given mortgage. */
  function portfolioWith(mortgage: MortgageBlock): Portfolio {
    return {
      properties: [
        {
          id: "dev",
          name: "Dev unit",
          purchaseDate: isoDate("2025-01-01"),
          purchasePrice: money("4000000"),
        },
      ],
      mortgages: [mortgage],
      valuations: [
        {
          id: "v",
          propertyId: "dev",
          validFrom: isoDate("2026-06-01"),
          marketValue: money("5000000"),
        },
      ],
      leases: [
        {
          id: "l",
          propertyId: "dev",
          startDate: isoDate("2025-01-01"),
          monthlyRent: money("20000"),
        },
      ],
      holdingCosts: [],
    };
  }

  // Running multi-draw + interest-only loan (matures startDate+30y = 2055).
  const running: MortgageBlock = {
    id: "dev",
    propertyId: "dev",
    startDate: isoDate("2025-01-01"),
    initialPrincipal: money("1000000"),
    fixationYears: 10,
    interestRatePa: rate("0.05"),
    monthlyInstalment: money("8000"),
    loanTermYears: 30,
    draws: [
      { date: isoDate("2025-07-01"), amount: money("1000000") },
      { date: isoDate("2026-12-01"), amount: money("1000000") },
    ],
    completionDate: isoDate("2026-09-01"),
  };

  it("Σ annual principal (yrs 1..N) equals total drawn through year-slicing", () => {
    const proj = portfolioProjection(portfolioWith(running), assumptions);
    let sum = D("0");
    for (let t = 1; t <= assumptions.horizonYears; t++)
      sum = sum.plus(proj[t].principal);
    expect(Math.abs(sum.toNumber() - 3_000_000)).toBeLessThanOrEqual(5);
  });

  it("debt is fully repaid at the startDate+term year and KPIs compute without throwing", () => {
    const kpis = portfolioKpis(portfolioWith(running), assumptions);
    expect(kpis.debtFreeYear).not.toBeNull();
    expect(kpis.debtFreeYear!).toBeGreaterThanOrEqual(2054);
    expect(kpis.debtFreeYear!).toBeLessThanOrEqual(2056);
    // Cash-flow KPIs are defined (no throw on the dev cash-flow vector).
    expect(kpis.cagrNominal?.isFinite()).toBe(true);
    expect(kpis.totalPrincipalRepaid.greaterThan(0)).toBe(true);
  });

  it("an interest-only projection year carries ~no principal; debt service is interest", () => {
    // Completion far out (2030) so year 1 (months 1..12 from baseDate) is fully IO.
    const longIo: MortgageBlock = {
      ...running,
      draws: undefined,
      initialPrincipal: money("2000000"),
      completionDate: isoDate("2030-01-01"),
    };
    const proj = portfolioProjection(portfolioWith(longIo), assumptions);
    const y1 = proj[1];
    expect(y1.principal.toNumber()).toBeLessThanOrEqual(KC);
    expect(y1.debtService.toNumber()).toBeGreaterThan(0);
    expect(
      Math.abs(y1.debtService.toNumber() - y1.interest.toNumber()),
    ).toBeLessThanOrEqual(KC);
  });
});

// D-24: a development loan re-amortizes only on a real event (a tranche landing, the
// end of interest-only, a rate change). D-31: its instalment comes from the required
// term, not from the entered field (DR-102).
describe("Development loan — instalment from the term, held between events (D-24/D-31)", () => {
  // Running since 2025-02-28, one tranche before baseDate, one in grid month 5
  // (2026-10-31 → 2026-11-07); fixation to 2035, so no rate change for years.
  const running: MortgageBlock = {
    id: "dev-held",
    propertyId: "javorova",
    startDate: isoDate("2025-02-28"),
    initialPrincipal: money("3000000"),
    fixationYears: 10,
    interestRatePa: rate("0.029"),
    monthlyInstalment: money("9000"),
    loanTermYears: 20,
    draws: [
      { date: isoDate("2025-10-31"), amount: money("500000") },
      { date: isoDate("2026-10-31"), amount: money("700000") },
    ],
  };
  const schedule = buildSchedule(running, assumptions);

  it("holds the instalment exactly between events", () => {
    for (const m of [2, 3, 4, 7, 8, 60, 100]) {
      expect(
        schedule[m - 1].instalment.equals(schedule[m - 2].instalment),
      ).toBe(true);
    }
  });

  it("re-amortizes in the month the tranche lands", () => {
    expect(schedule[4].instalment.greaterThan(schedule[3].instalment)).toBe(
      true,
    );
  });

  it("ignores the entered instalment", () => {
    const other = buildSchedule(
      { ...running, monthlyInstalment: money("50000") },
      assumptions,
    );
    expect(other.map((r) => r.instalment.toString())).toEqual(
      schedule.map((r) => r.instalment.toString()),
    );
    expect(other.map((r) => r.endBalance.toString())).toEqual(
      schedule.map((r) => r.endBalance.toString()),
    );
  });

  it("a running loan with no event yet pays instalmentFor(principal, rate, term)", () => {
    const noEventYet: MortgageBlock = {
      ...running,
      draws: [{ date: isoDate("2027-03-31"), amount: money("700000") }],
    };
    const s = buildSchedule(noEventYet, assumptions);
    expect(
      s[0].instalment.equals(instalmentFor(D("3000000"), D("0.029"), 20)),
    ).toBe(true);
  });

  it("a future-start loan's first payment is instalmentFor(principal, rate, term)", () => {
    const future: MortgageBlock = {
      ...running,
      startDate: isoDate("2026-09-01"),
      draws: [{ date: isoDate("2027-09-01"), amount: money("700000") }],
    };
    const s = buildSchedule(future, assumptions);
    const first = s.find((r) => r.interest.greaterThan(0))!;
    expect(
      first.instalment.equals(instalmentFor(D("3000000"), D("0.029"), 20)),
    ).toBe(true);
  });

  it("emits zero rows after maturity (payoff guard)", () => {
    // Matures 2030-01-15, well inside the 30-year horizon.
    const short: MortgageBlock = {
      ...running,
      startDate: isoDate("2020-01-15"),
      initialPrincipal: money("1000000"),
      loanTermYears: 10,
      draws: [{ date: isoDate("2020-06-15"), amount: money("200000") }],
    };
    const s = buildSchedule(short, assumptions);
    // The payment due 2030-01-15 sits on grid row 2030-02-07 and clears the balance.
    const payoff = s.findIndex((r) => r.endBalance.isZero());
    expect(s[payoff].date).toEqual(isoDate("2030-02-07"));
    const after = s.slice(payoff + 1);
    expect(after.length).toBeGreaterThan(300);
    for (const r of after) {
      expect(r.instalment.isZero()).toBe(true);
      expect(r.interest.isZero()).toBe(true);
      expect(r.principal.isZero()).toBe(true);
      expect(r.endBalance.isZero()).toBe(true);
    }
  });
});
