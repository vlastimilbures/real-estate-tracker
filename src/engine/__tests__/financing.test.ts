// ADR 0103 (#31): financing exposure (next fixation, balance at reset, debt resetting in N
// years, modelled payoff and remaining term) and upcoming events, all read off the same
// schedules the projection uses.
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  debtResettingWithin,
  financingExposure,
  leaseEndWithoutFollowOn,
  propertyLoanExposure,
  upcomingEvents,
  type FinancingExposure,
  type FixationReset,
} from "../financing";
import { propertySchedules, type PropertySchedule } from "../schedule";
import { portfolioOutputs } from "../outputs";
import { impliedMaturity, mortgageBlock } from "../amortization";
import { edate, isoDate } from "../dates";
import { money, rate } from "../brands";
import { ZERO } from "../../lib/money";
import type {
  AmortizationRow,
  IsoDate,
  MortgageBlock,
  MortgageBlockFields,
  Portfolio,
} from "../types";
import { BASE_DATE, assumptions, portfolio } from "./support/seed";
import { devBlock, mixed } from "./support/mixed";
import { mixedWithRefi } from "./support/synthetic";
import { expectKc } from "./support/tolerance";

function exposure(p: Portfolio, asOf: IsoDate = BASE_DATE) {
  const ids = p.properties.map((x) => x.id);
  const schedules = propertySchedules(p.mortgages, ids, assumptions);
  return { fx: financingExposure(p, assumptions, schedules, asOf), schedules };
}

function scheduleOf(s: Map<string, PropertySchedule>, id: string) {
  const one = s.get(id);
  if (!one) throw new Error(`no schedule for ${id}`);
  return one;
}

const rowsOf = (s: Map<string, PropertySchedule>, id: string) =>
  scheduleOf(s, id).rows;

/** 1-based month of the last row before the first rate change (the reset row is +1). */
function lastFixedMonth(rows: AmortizationRow[]): number {
  const i = rows.findIndex(
    (r, k) => k > 0 && !r.ratePa.equals(rows[k - 1].ratePa),
  );
  return i;
}

function reset(fx: FinancingExposure, blockId: string): FixationReset {
  const r = fx.resets.find((x) => x.blockId === blockId);
  if (!r) throw new Error(`no reset for ${blockId}`);
  return r;
}

function loan(fx: FinancingExposure, propertyId: string) {
  const l = fx.loans.find((x) => x.propertyId === propertyId);
  if (!l) throw new Error(`no loan for ${propertyId}`);
  return l;
}

/** A one-property portfolio with the given blocks. */
function single(...blocks: MortgageBlock[]): Portfolio {
  return {
    properties: [
      {
        id: "p",
        name: "P",
        purchaseDate: isoDate("2015-01-01"),
        purchasePrice: money("5000000"),
      },
    ],
    mortgages: blocks,
    valuations: [],
    leases: [],
    holdingCosts: [],
  };
}

function block(
  over: Partial<MortgageBlockFields> & { id: string },
): MortgageBlock {
  return mortgageBlock({
    propertyId: "p",
    startDate: isoDate("2024-01-10"),
    initialPrincipal: money("3000000"),
    fixationYears: 5,
    interestRatePa: rate("0.04"),
    monthlyInstalment: money("14322.46"),
    ...over,
  });
}

describe("ADR 0103: next fixation on the sample portfolio", () => {
  const { fx, schedules } = exposure(portfolio);

  it.each([
    ["javorova", "m-javorova", "2031-01-17"],
    ["lipova", "m-lipova", "2029-01-15"],
    ["dubova", "m-dubova", "2031-03-12"],
  ])("%s: next fixation %s is the schedule's reset row", (pid, bid, end) => {
    const rows = rowsOf(schedules, pid);
    const m = lastFixedMonth(rows);
    const next = loan(fx, pid).nextFixation;
    expect(next?.blockId).toBe(bid);
    expect(next?.status).toBe("upcoming");
    expect(next?.fixationEnd.toISOString().slice(0, 10)).toBe(end);
    expect(next?.gridMonth).toBe(m);
    expect(next?.balance.toString()).toBe(rows[m - 1].endBalance.toString());
  });

  it("Javorova's fixation-end payment is grid month 56 (still fixed, D-21)", () => {
    expect(reset(fx, "m-javorova").gridMonth).toBe(56);
  });

  it("debt resetting in 1/3/5 years is Σ schedule balances at the resets in the window", () => {
    const bal = (pid: string) => {
      const rows = rowsOf(schedules, pid);
      return rows[lastFixedMonth(rows) - 1].endBalance;
    };
    expect(debtResettingWithin(fx, 1).amount.isZero()).toBe(true);
    expect(debtResettingWithin(fx, 1).loans).toBe(0);
    const three = debtResettingWithin(fx, 3);
    expect(three.loans).toBe(1);
    expectKc(three.amount, bal("lipova").toNumber(), "3y");
    const five = debtResettingWithin(fx, 5);
    expect(five.loans).toBe(3);
    expectKc(
      five.amount,
      bal("lipova").plus(bal("javorova")).plus(bal("dubova")).toNumber(),
      "5y",
    );
  });

  it("payoff is the schedule's last payment, at the loan's implied maturity", () => {
    for (const b of portfolio.mortgages) {
      const rows = rowsOf(schedules, b.propertyId);
      const paid = rows.map((r) =>
        r.interest.plus(r.principal).greaterThan(ZERO),
      );
      const last = paid.lastIndexOf(true);
      const l = loan(fx, b.propertyId);
      expect(l.blockId).toBe(b.id);
      expect(l.remainingMonths).toBe(last + 1);
      expect(l.payoffDate?.getTime()).toBe(impliedMaturity(b)?.getTime());
    }
  });

  it("is what portfolioOutputs returns", () => {
    const out = portfolioOutputs(portfolio, assumptions);
    expect(out.financing).toEqual(fx);
  });
});

describe("ADR 0103: as-of after baseDate", () => {
  const asOf = isoDate("2029-02-01");
  const { fx, schedules } = exposure(portfolio, asOf);

  it("a fixation end on or before as-of has passed", () => {
    expect(reset(fx, "m-lipova").status).toBe("passed");
    expect(loan(fx, "lipova").nextFixation).toBeNull();
    expect(loan(fx, "javorova").nextFixation?.blockId).toBe("m-javorova");
  });

  it("remaining months count the payments due after as-of (ADR 0117)", () => {
    // Dubova pays on the 12th until 12.12.2040: Feb 2029 to Dec 2040.
    expect(loan(fx, "dubova").remainingMonths).toBe(143);
    expect(rowsOf(schedules, "dubova").length).toBeGreaterThan(143);
  });

  it("the window starts at as-of", () => {
    // 2029-02-01 + 3 y = 2032-02-01: Javorova (2031-01-17) and Dubova (2031-03-12).
    expect(debtResettingWithin(fx, 3).loans).toBe(2);
  });
});

describe("ADR 0103: edge cases", () => {
  it("expired fixation: passed, no next fixation (ADR 0030)", () => {
    const old = block({
      id: "old",
      startDate: isoDate("2016-01-10"),
      fixationYears: 5,
      monthlyInstalment: money("14322.46"),
    });
    const { fx } = exposure(single(old));
    expect(reset(fx, "old").status).toBe("passed");
    expect(loan(fx, "p").nextFixation).toBeNull();
    expect(loan(fx, "p").remainingMonths).toBeGreaterThan(0);
  });

  it("paid off before the reset: repaid, balance 0", () => {
    const short = block({
      id: "short",
      fixationYears: 10,
      loanTermYears: 5,
      monthlyInstalment: money("55249.79"),
    });
    const { fx } = exposure(single(short));
    const r = reset(fx, "short");
    expect(r.status).toBe("repaid");
    expect(r.balance.isZero()).toBe(true);
    expect(loan(fx, "p").nextFixation).toBeNull();
    expect(debtResettingWithin(fx, 30).loans).toBe(0);
  });

  it("fixed to maturity: the fixation-end payment repays it, so no reset", () => {
    const toEnd = block({
      id: "to-end",
      fixationYears: 5,
      loanTermYears: 5,
      monthlyInstalment: money("55249.79"),
    });
    expect(reset(exposure(single(toEnd)).fx, "to-end").status).toBe("repaid");
  });

  it("a reset one payment before payoff: upcoming, with the balance after its own payment", () => {
    // 61 payments of 1,000 at 0 %: 1,000 is left after payment 60 on the fixation end.
    const short = block({
      id: "short",
      startDate: isoDate("2026-06-07"),
      initialPrincipal: money("61000"),
      interestRatePa: rate("0"),
      monthlyInstalment: money("1000"),
    });
    const r = reset(exposure(single(short)).fx, "short");
    expect([r.gridMonth, r.status, r.balance.toString()]).toEqual([
      60,
      "upcoming",
      "1000",
    ]);
  });

  it("0 fixation years: a floating loan has no fixation end", () => {
    const floating = block({ id: "float", fixationYears: 0 });
    const { fx } = exposure(single(floating));
    expect(fx.resets).toHaveLength(0);
    expect(loan(fx, "p").nextFixation).toBeNull();
  });

  it("development loan before completion: balance from the dev schedule", () => {
    const { fx, schedules } = exposure(mixed);
    const rows = rowsOf(schedules, "dev");
    const r = reset(fx, devBlock.id);
    expect(r.status).toBe("upcoming");
    expect(r.fixationEnd.toISOString().slice(0, 10)).toBe("2031-03-01");
    expect(r.balance.toString()).toBe(
      rows[r.gridMonth - 1].endBalance.toString(),
    );
    expect(r.gridMonth).toBe(lastFixedMonth(rows));
  });

  it("future loan: grid month counts from its draw month", () => {
    const { fx, schedules } = exposure(mixed);
    const rows = rowsOf(schedules, "future");
    const r = reset(fx, "m-future");
    expect(r.status).toBe("upcoming");
    expect(r.gridMonth).toBe(lastFixedMonth(rows));
    expect(loan(fx, "future").blockId).toBe("m-future");
  });

  it("refinance successor: the predecessor is replaced, the successor resets", () => {
    const { fx, schedules } = exposure(mixedWithRefi);
    expect(reset(fx, "m-javorova").status).toBe("replaced");
    expect(reset(fx, "m-javorova").balance.isZero()).toBe(true);
    const next = loan(fx, "javorova").nextFixation;
    expect(next?.blockId).toBe("m-refi");
    expect(next?.fixationEnd.toISOString().slice(0, 10)).toBe("2036-01-17");
    const rows = rowsOf(schedules, "javorova");
    expect(next?.balance.toString()).toBe(
      rows[(next?.gridMonth ?? 0) - 1].endBalance.toString(),
    );
    // In force at as-of is still the predecessor; after the handover the successor.
    expect(loan(fx, "javorova").blockId).toBe("m-javorova");
    const later = exposure(mixedWithRefi, isoDate("2032-01-01")).fx;
    expect(loan(later, "javorova").blockId).toBe("m-refi");
  });

  it("a successor starting in the fixation-end schedule month replaces it", () => {
    // Fixation-end payment due 2029-01-10 sits on grid month 2029-02-07; a successor
    // starting 2029-01-20 draws in that same month.
    const first = block({ id: "first" });
    const next = block({
      id: "next",
      startDate: isoDate("2029-01-20"),
      initialPrincipal: money("2500000"),
    });
    const { fx } = exposure(single(first, next));
    expect(reset(fx, "first").status).toBe("replaced");
  });

  it("inactive properties and properties without a loan are left out", () => {
    const { fx } = exposure(mixed);
    expect(fx.loans.map((l) => l.propertyId)).not.toContain("inactive");
    expect(fx.resets.map((r) => r.propertyId)).not.toContain("inactive");
    const noLoan = { ...single(), mortgages: [] };
    expect(exposure(noLoan).fx).toEqual({
      asOf: BASE_DATE,
      loans: [],
      resets: [],
    });
  });

  it("one property's loan is its portfolio entry, inactive or not (ADR 0116)", () => {
    const { fx, schedules } = exposure(portfolio);
    for (const loan of fx.loans) {
      const blocks = portfolio.mortgages.filter(
        (b) => b.propertyId === loan.propertyId,
      );
      expect(
        propertyLoanExposure(
          blocks,
          assumptions,
          scheduleOf(schedules, loan.propertyId),
          BASE_DATE,
        )?.loan,
      ).toEqual(loan);
    }
    const ids = mixed.properties.map((x) => x.id);
    const s = propertySchedules(mixed.mortgages, ids, assumptions);
    const inactive = mixed.mortgages.filter((b) => b.propertyId === "inactive");
    expect(inactive.length).toBeGreaterThan(0);
    expect(
      propertyLoanExposure(
        inactive,
        assumptions,
        scheduleOf(s, "inactive"),
        BASE_DATE,
      )?.loan.propertyId,
    ).toBe("inactive");
    expect(
      propertyLoanExposure(
        [],
        assumptions,
        { rows: [], eventOutcomes: [] },
        BASE_DATE,
      ),
    ).toBeNull();
  });

  it("one property's resets are its Dashboard resets, its chain the blocks in order (ADR 0117)", () => {
    const asOf = isoDate("2030-06-01");
    const { fx, schedules } = exposure(mixedWithRefi, asOf);
    for (const loan of fx.loans) {
      const one = propertyLoanExposure(
        mixedWithRefi.mortgages.filter((b) => b.propertyId === loan.propertyId),
        assumptions,
        scheduleOf(schedules, loan.propertyId),
        asOf,
      );
      expect(one?.resets).toEqual(
        fx.resets.filter((r) => r.propertyId === loan.propertyId),
      );
    }
    const javorova = mixedWithRefi.mortgages.filter(
      (b) => b.propertyId === "javorova",
    );
    expect(
      propertyLoanExposure(
        javorova,
        assumptions,
        scheduleOf(schedules, "javorova"),
        asOf,
      )?.chain,
    ).toEqual(["m-javorova", "m-refi"]);
    const old = block({ id: "old", startDate: isoDate("2018-03-10") });
    const now = block({ id: "now", startDate: isoDate("2024-01-10") });
    const later = block({ id: "later", startDate: isoDate("2029-01-10") });
    const blocks = [later, old, now];
    const one = scheduleOf(propertySchedules(blocks, ["p"], assumptions), "p");
    expect(
      propertyLoanExposure(blocks, assumptions, one, BASE_DATE)?.chain,
    ).toEqual(["now", "later"]);
  });
});

describe("ADR 0117: replaced and repaid outrank passed", () => {
  const at = (asOf: string, ...blocks: MortgageBlock[]) =>
    exposure(single(...blocks), isoDate(asOf)).fx;

  it("a block refinanced mid-fixation stays replaced after its fixation end", () => {
    const a = block({ id: "a", startDate: isoDate("2024-01-10") });
    const b = block({ id: "b", startDate: isoDate("2027-01-10") });
    expect(reset(at("2026-06-07", a, b), "a").status).toBe("replaced");
    expect(reset(at("2029-06-01", a, b), "a").status).toBe("replaced");
  });

  it("a refix on the fixation end stays replaced after it", () => {
    const a = block({
      id: "a",
      startDate: isoDate("2024-01-10"),
      fixationYears: 3,
    });
    const b = block({
      id: "b",
      startDate: isoDate("2027-01-10"),
      fixationYears: 2,
    });
    expect(reset(at("2026-12-01", a, b), "a").status).toBe("replaced");
    expect(reset(at("2027-06-01", a, b), "a").status).toBe("replaced");
  });

  it("a loan repaid before its fixation end stays repaid after it", () => {
    const short = block({
      id: "short",
      startDate: isoDate("2025-06-10"),
      initialPrincipal: money("300000"),
    });
    expect(reset(at("2026-06-07", short), "short").status).toBe("repaid");
    expect(reset(at("2030-07-01", short), "short").status).toBe("repaid");
  });

  it("a reset that happened in the model has passed; one before baseDate too (ADR 0030)", () => {
    expect(
      reset(exposure(portfolio, isoDate("2031-06-01")).fx, "m-javorova").status,
    ).toBe("passed");
    const old = block({ id: "old", startDate: isoDate("2016-01-10") });
    expect(reset(at("2026-06-07", old), "old").status).toBe("passed");
  });

  it("a fixation end paid on baseDate (grid month 0) has passed", () => {
    // 2021-06-07 + 5 y = baseDate: payment 60 is due by baseDate, so it has no row.
    const onBase = block({ id: "on-base", startDate: isoDate("2021-06-07") });
    const r = reset(at("2026-06-07", onBase), "on-base");
    expect([r.gridMonth, r.status]).toEqual([0, "passed"]);
  });

  it("a fixation end before baseDate has passed, whatever the as-of", () => {
    const old = block({ id: "old", startDate: isoDate("2016-01-10") });
    const fx = at("2020-06-01", old);
    expect(reset(fx, "old").status).toBe("passed");
    expect(loan(fx, "p").nextFixation).toBeNull();
  });
});

describe("ADR 0117: remaining term = payments due after as-of", () => {
  const months = (asOf: string, pid: string, p: Portfolio = portfolio) =>
    loan(exposure(p, isoDate(asOf)).fx, pid).remainingMonths;

  it("a payment made this grid month no longer counts", () => {
    // Javorova pays on the 17th until 17.05.2051; 17.06.2026 is paid by 06.07.2026.
    expect(months("2026-06-07", "javorova")).toBe(300);
    expect(months("2026-07-06", "javorova")).toBe(299);
    // Dubova pays on the 12th until 12.12.2040: Oct 2026 to Dec 2040.
    expect(months("2026-10-01", "dubova")).toBe(171);
  });

  it("is 0 from the payoff date on", () => {
    expect(months("2051-05-16", "javorova")).toBe(1);
    expect(months("2051-05-17", "javorova")).toBe(0);
    expect(months("2051-05-20", "javorova")).toBe(0);
  });

  it("a refinance chain: each month's payment is on the block drawn before it", () => {
    // a pays on the 10th; b (drawn in grid month 8) and c (month 32) on the 25th.
    const chain = single(
      block({ id: "a" }),
      block({ id: "b", startDate: isoDate("2027-01-25") }),
      block({ id: "c", startDate: isoDate("2029-01-25") }),
    );
    const view = (asOf: string) => loan(exposure(chain, isoDate(asOf)).fx, "p");
    // c's 360th payment, on its own day.
    expect(view("2026-06-07").payoffDate).toEqual(isoDate("2059-01-25"));
    expect(view("2026-06-07").remainingMonths).toBe(392);
    // 15.03.2027: a would have paid its March payment, b (due 25.03) has not.
    expect(view("2027-03-15").remainingMonths).toBe(383);
    expect(view("2030-01-01").blockId).toBe("c");
  });

  it("a loan not yet drawn counts its own payments only", () => {
    // 3,000,000 at 4 % for 14,322.46 is a 30-year annuity: 360 payments from 10.02.2028,
    // none in the 19 schedule months before the draw.
    const later = block({ id: "later", startDate: isoDate("2028-01-10") });
    expect(loan(exposure(single(later)).fx, "p").remainingMonths).toBe(360);
  });
});

describe("ADR 0103: upcoming events", () => {
  const withoutFollowOn: Portfolio = {
    ...portfolio,
    leases: portfolio.leases.filter((l) => l.id !== "l-lipova-2"),
  };

  it("a lease end followed by a later lease is not an event", () => {
    const { fx } = exposure(portfolio);
    const events = upcomingEvents(portfolio, fx, 12);
    expect(events.filter((e) => e.kind === "leaseEnd")).toHaveLength(0);
  });

  it("the in-force lease end with no follow-on is an event; open-ended leases are not", () => {
    const { fx } = exposure(withoutFollowOn);
    const events = upcomingEvents(withoutFollowOn, fx, 12);
    expect(events).toEqual([
      { date: isoDate("2026-08-30"), kind: "leaseEnd", propertyId: "lipova" },
    ]);
  });

  it("past events are excluded and the window is (as-of, as-of + months]", () => {
    const { fx } = exposure(withoutFollowOn, isoDate("2026-09-01"));
    expect(upcomingEvents(withoutFollowOn, fx, 12)).toEqual([]);
    const edge = exposure(portfolio, isoDate("2028-01-15")).fx;
    const ev = upcomingEvents(portfolio, edge, 12);
    expect(ev.map((e) => e.kind)).toEqual(["fixationEnd"]);
    expect(ev[0].propertyId).toBe("lipova");
    expectKc(
      ev[0].amount ?? ZERO,
      reset(edge, "m-lipova").balance.toNumber(),
      "amt",
    );
  });

  it("the lease-end helper: the in-force lease's end, unless open-ended or followed", () => {
    const lipova = (p: Portfolio) =>
      p.leases.filter((l) => l.propertyId === "lipova");
    // l-lipova-1 ends 2026-08-30; l-lipova-2 follows it.
    expect(leaseEndWithoutFollowOn(lipova(portfolio), BASE_DATE)).toBeNull();
    expect(leaseEndWithoutFollowOn(lipova(withoutFollowOn), BASE_DATE)).toEqual(
      isoDate("2026-08-30"),
    );
    // In force on its last day; nothing in force the day after.
    expect(
      leaseEndWithoutFollowOn(lipova(withoutFollowOn), isoDate("2026-08-30")),
    ).toEqual(isoDate("2026-08-30"));
    expect(
      leaseEndWithoutFollowOn(lipova(withoutFollowOn), isoDate("2026-08-31")),
    ).toBeNull();
    const javorova = portfolio.leases.filter(
      (l) => l.propertyId === "javorova",
    );
    expect(leaseEndWithoutFollowOn(javorova, BASE_DATE)).toBeNull();
  });

  it("modelled payoff and development completion are events", () => {
    const javorova = portfolio.mortgages[0];
    const payoff = impliedMaturity(javorova);
    if (!payoff) throw new Error("plain loan has a maturity");
    const { fx } = exposure(portfolio, edate(payoff, -6));
    const kinds = upcomingEvents(portfolio, fx, 12).map(
      (e) => `${e.kind}:${e.propertyId}`,
    );
    expect(kinds).toContain("loanPayoff:javorova");

    const dev = exposure(mixed, isoDate("2026-12-01")).fx;
    const devEvents = upcomingEvents(mixed, dev, 12);
    expect(devEvents).toContainEqual({
      date: isoDate("2027-08-20"),
      kind: "devCompletion",
      propertyId: "dev",
    });
  });

  it("is sorted by date, and every event is inside the window", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 300 }),
        fc.integer({ min: 1, max: 60 }),
        (k, months) => {
          const asOf = edate(BASE_DATE, k);
          const { fx } = exposure(mixedWithRefi, asOf);
          const events = upcomingEvents(mixedWithRefi, fx, months);
          const end = edate(asOf, months).getTime();
          for (const [i, e] of events.entries()) {
            expect(e.date.getTime()).toBeGreaterThan(asOf.getTime());
            expect(e.date.getTime()).toBeLessThanOrEqual(end);
            if (i > 0) {
              expect(e.date.getTime()).toBeGreaterThanOrEqual(
                events[i - 1].date.getTime(),
              );
            }
          }
        },
      ),
      { numRuns: 40 },
    );
  });

  it("a replaced fixation end and a loan repaid before baseDate are not events", () => {
    // a's fixation ends 2029-01-10, inside the window, but b replaces a first.
    const a = block({ id: "a", startDate: isoDate("2024-01-10") });
    const b = block({ id: "b", startDate: isoDate("2027-01-10") });
    const refi = single(a, b);
    const { fx: refiFx } = exposure(refi);
    expect(reset(refiFx, "a").status).toBe("replaced");
    expect(upcomingEvents(refi, refiFx, 36)).toEqual([]);

    const old = single(
      block({
        id: "old",
        startDate: isoDate("2020-01-10"),
        initialPrincipal: money("300000"),
      }),
    );
    const { fx } = exposure(old);
    expect(loan(fx, "p").payoffDate).toBeNull();
    expect(loan(fx, "p").remainingMonths).toBeNull();
    expect(upcomingEvents(old, fx, 360)).toEqual([]);
  });

  it("one completion per development loan; none when a successor replaces it first", () => {
    const dev = exposure(mixed, isoDate("2026-12-01")).fx;
    expect(
      upcomingEvents(mixed, dev, 12).filter((e) => e.kind === "devCompletion"),
    ).toEqual([
      { date: isoDate("2027-08-20"), kind: "devCompletion", propertyId: "dev" },
    ]);

    // The successor starts 2027-01-10, before the 2027-08-20 completion.
    const replaced = single(
      { ...devBlock, propertyId: "p" },
      block({ id: "succ", startDate: isoDate("2027-01-10") }),
    );
    const kinds = upcomingEvents(replaced, exposure(replaced).fx, 24).map(
      (e) => e.kind,
    );
    expect(kinds).not.toContain("devCompletion");
  });

  it("lease ends of active properties only; same-day events by property id", () => {
    const owned = (id: string, active?: boolean) => ({
      id,
      name: id,
      purchaseDate: isoDate("2015-01-01"),
      purchasePrice: money("5000000"),
      ...(active === undefined ? {} : { active }),
    });
    const lease = (propertyId: string) => ({
      id: `l-${propertyId}`,
      propertyId,
      startDate: isoDate("2025-01-01"),
      endDate: isoDate("2026-12-31"),
      monthlyRent: money("20000"),
    });
    const p: Portfolio = {
      ...single(),
      properties: [owned("b", true), owned("a"), owned("x", false)],
      leases: [lease("b"), lease("a"), lease("x")],
    };
    expect(upcomingEvents(p, exposure(p).fx, 12)).toEqual([
      { date: isoDate("2026-12-31"), kind: "leaseEnd", propertyId: "a" },
      { date: isoDate("2026-12-31"), kind: "leaseEnd", propertyId: "b" },
    ]);
  });

  it("same-day events: fixation end, then payoff, then lease end, whatever the property", () => {
    const day = isoDate("2026-12-31");
    const p: Portfolio = {
      ...single(),
      properties: [{ ...single().properties[0], id: "a" }],
      leases: [
        {
          id: "l-a",
          propertyId: "a",
          startDate: isoDate("2025-01-01"),
          endDate: day,
          monthlyRent: money("20000"),
        },
      ],
    };
    const fx: FinancingExposure = {
      asOf: BASE_DATE,
      loans: [
        {
          propertyId: "m",
          blockId: "m",
          nextFixation: null,
          payoffDate: day,
          remainingMonths: 7,
          interestSaved: null,
        },
      ],
      resets: [
        {
          propertyId: "z",
          blockId: "z",
          fixationEnd: day,
          gridMonth: 7,
          status: "upcoming",
          balance: money("1"),
        },
      ],
    };
    expect(
      upcomingEvents(p, fx, 12).map((e) => [e.kind, e.propertyId]),
    ).toEqual([
      ["fixationEnd", "z"],
      ["loanPayoff", "m"],
      ["leaseEnd", "a"],
    ]);
  });
});

describe("ADR 0103: properties", () => {
  it("debt resetting is Σ upcoming balances in the window, monotone in N, within the schedule", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 300 }), (k) => {
        const asOf = edate(BASE_DATE, k);
        const { fx, schedules } = exposure(mixedWithRefi, asOf);
        let prev = ZERO;
        for (const years of [1, 3, 5, 30]) {
          const end = edate(asOf, years * 12).getTime();
          const inWindow = fx.resets.filter(
            (r) => r.status === "upcoming" && r.fixationEnd.getTime() <= end,
          );
          const sum = inWindow.reduce((s, r) => s.plus(r.balance), ZERO);
          const got = debtResettingWithin(fx, years);
          expect(got.amount.toString()).toBe(sum.toString());
          expect(got.loans).toBe(inWindow.length);
          expect(got.amount.greaterThanOrEqualTo(prev)).toBe(true);
          prev = got.amount;
        }
        for (const r of fx.resets) {
          expect(r.balance.isNegative()).toBe(false);
          if (r.status !== "upcoming") continue;
          expect(r.fixationEnd.getTime()).toBeGreaterThan(asOf.getTime());
          const peak = rowsOf(schedules, r.propertyId).reduce(
            (m, row) => (row.endBalance.greaterThan(m) ? row.endBalance : m),
            ZERO,
          );
          expect(r.balance.lessThanOrEqualTo(peak)).toBe(true);
        }
      }),
      { numRuns: 40 },
    );
  });
});
