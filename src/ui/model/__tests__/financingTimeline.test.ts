// ADR 0204 (#377): the fixation timeline of "Financing & upcoming": one row per loan,
// earliest fixation end first, positions as fractions of the chosen window, the other
// dates of the window as marks on their property's row.
import { describe, it, expect } from "vitest";
import {
  edate,
  impliedMaturity,
  isoDate,
  portfolioOutputs,
  type Portfolio,
} from "../../../engine";
import { mixed } from "../../../engine/__tests__/support/mixed";
import { assumptions, portfolio } from "../../../engine/__tests__/support/seed";
import { en } from "../../../i18n/en";
import { cs } from "../../../i18n/cs";
import { ru } from "../../../i18n/ru";
import { financingTimeline, timelineTable } from "../financing";

function run(p: Portfolio, asOf = assumptions.baseDate) {
  return portfolioOutputs(p, assumptions, asOf);
}

const d = en.dashboard;
const out = run(portfolio);
const resetOf = (id: string) =>
  out.financing.resets.find((r) => r.blockId === id)!;

describe("financingTimeline rows (ADR 0204 §2)", () => {
  const tl = financingTimeline(out.financing, portfolio, "3", en);

  it("has one row per loan, earliest fixation end first", () => {
    expect(tl.rows.map((r) => r.propertyName)).toEqual([
      "Byt Lipova",
      "Byt Javorova",
      "Byt Dubova",
    ]);
    expect(tl.rows.every((r) => r.hasLoan)).toBe(true);
  });

  it("gives each fixation end its date, time left, debt at reset and place", () => {
    const [lipova, javorova] = tl.rows;
    expect(lipova.fixation).toEqual({
      kind: "fixationEnd",
      label: d.financingEventFixationEnd,
      date: "15.01.2029",
      timeLeft: d.financingIn("2 yrs 7 months"),
      amount: resetOf("m-lipova").balance,
      at: expect.closeTo(953 / 1096, 4),
      beyond: false,
      next: true,
    });
    // After the 3-year window: the bar runs off the edge, the date is still there.
    expect(javorova.fixation).toMatchObject({
      date: "17.01.2031",
      timeLeft: d.financingIn("4 yrs 7 months"),
      amount: resetOf("m-javorova").balance,
      at: 1,
      beyond: true,
      next: false,
    });
  });

  it("flags only the next reset", () => {
    expect(tl.rows.map((r) => r.fixation?.next)).toEqual([true, false, false]);
  });

  it("a longer window brings a fixation end inside it", () => {
    const five = financingTimeline(out.financing, portfolio, "5", en);
    const javorova = five.rows[1].fixation!;
    expect(javorova.beyond).toBe(false);
    expect(javorova.at).toBeLessThan(1);
    expect(five.rows[2].fixation?.beyond).toBe(false);
    const one = financingTimeline(out.financing, portfolio, "1", en);
    expect(one.rows.every((r) => r.fixation?.beyond)).toBe(true);
  });

  it("says when a loan has no fixation end ahead, after the loans that have one", () => {
    const o = run(portfolio, isoDate("2029-06-01"));
    const t2 = financingTimeline(o.financing, portfolio, "3", en);
    const lipova = t2.rows.find((r) => r.propertyId === "lipova")!;
    expect(t2.rows.at(-1)).toBe(lipova);
    expect(lipova.hasLoan).toBe(true);
    expect(lipova.fixation).toBeNull();
  });

  it("falls back to the property id when the name is not in the portfolio", () => {
    const t2 = financingTimeline(
      out.financing,
      { ...portfolio, properties: [] },
      "3",
      en,
    );
    expect(t2.rows[0].propertyName).toBe("lipova");
  });
});

describe("financingTimeline marks (ADR 0204 §3)", () => {
  const noFollowOn = {
    ...portfolio,
    leases: portfolio.leases.filter((l) => l.id !== "l-lipova-2"),
  };

  it("puts a lease end on its property's row, labelled in each language", () => {
    const o = run(noFollowOn);
    for (const t of [en, cs, ru]) {
      const tl = financingTimeline(o.financing, noFollowOn, "3", t);
      const lipova = tl.rows.find((r) => r.propertyId === "lipova")!;
      expect(lipova.marks).toEqual([
        {
          kind: "leaseEnd",
          label: t.dashboard.financingEventLeaseEnd,
          date: "30.08.2026",
          timeLeft: t.dashboard.financingIn(t.propertyDetail.monthsCount(2)),
          amount: null,
          at: expect.closeTo(84 / 1096, 4),
        },
      ]);
      expect(tl.kinds.map((k) => k.kind)).toEqual(["fixationEnd", "leaseEnd"]);
      expect(tl.kinds[1].label).toBe(t.dashboard.financingEventLeaseEnd);
    }
  });

  it("marks a modelled payoff and a development completion", () => {
    const b = portfolio.mortgages.find((x) => x.id === "m-javorova")!;
    const payoff = edate(impliedMaturity(b)!, -6);
    const o = run(portfolio, payoff);
    const tl = financingTimeline(o.financing, portfolio, "3", en);
    expect(tl.rows.flatMap((r) => r.marks.map((m) => m.kind))).toContain(
      "loanPayoff",
    );
    const dv = run(mixed, isoDate("2026-12-01"));
    const dev = financingTimeline(dv.financing, mixed, "3", en);
    expect(dev.rows.find((r) => r.propertyId === "dev")?.marks).toContainEqual(
      expect.objectContaining({
        kind: "devCompletion",
        label: d.financingEventDevCompletion,
        date: "20.08.2027",
      }),
    );
  });

  it("follows the window: a lease end two years ahead shows only from 3 years", () => {
    const p: Portfolio = {
      ...noFollowOn,
      leases: noFollowOn.leases.map((l) =>
        l.id === "l-lipova-1" ? { ...l, endDate: isoDate("2028-05-31") } : l,
      ),
    };
    const o = run(p);
    const marks = (span: "1" | "3") =>
      financingTimeline(o.financing, p, span, en).rows.flatMap((r) => r.marks);
    expect(marks("1")).toEqual([]);
    expect(marks("3").map((m) => m.date)).toEqual(["31.05.2028"]);
  });

  it("gives a property with a date but no loan a row without a fixation, after the loans", () => {
    const p: Portfolio = {
      ...noFollowOn,
      mortgages: noFollowOn.mortgages.filter((m) => m.propertyId !== "lipova"),
    };
    const o = run(p);
    const tl = financingTimeline(o.financing, p, "3", en);
    const last = tl.rows.at(-1)!;
    expect(last).toMatchObject({
      propertyId: "lipova",
      hasLoan: false,
      fixation: null,
    });
    expect(last.marks.map((m) => m.kind)).toEqual(["leaseEnd"]);
  });
});

describe("financingTimeline axis (ADR 0204 §4)", () => {
  it("ticks each 1 January inside the window", () => {
    const tl = financingTimeline(out.financing, portfolio, "3", en);
    expect(tl.ticks.map((x) => x.label)).toEqual(["2027", "2028", "2029"]);
    expect(tl.ticks[0].at).toBeCloseTo(208 / 1096, 4);
    expect(
      financingTimeline(out.financing, portfolio, "1", en).ticks.map(
        (x) => x.label,
      ),
    ).toEqual(["2027"]);
  });

  it("shows no fixation kind in the legend without a fixation end", () => {
    const o = run(portfolio, isoDate("2032-01-01"));
    const tl = financingTimeline(o.financing, portfolio, "1", en);
    expect(tl.kinds.map((k) => k.kind)).not.toContain("fixationEnd");
  });
});

describe("timelineTable (ADR 0204 §5)", () => {
  it("lists each row's fixation end, then its other dates", () => {
    const p = {
      ...portfolio,
      leases: portfolio.leases.filter((l) => l.id !== "l-lipova-2"),
    };
    const o = run(p);
    const rows = timelineTable(financingTimeline(o.financing, p, "3", en));
    expect(rows.map((r) => [r.propertyName, r.event, r.date])).toEqual([
      ["Byt Lipova", d.financingEventFixationEnd, "15.01.2029"],
      ["Byt Lipova", d.financingEventLeaseEnd, "30.08.2026"],
      ["Byt Javorova", d.financingEventFixationEnd, "17.01.2031"],
      ["Byt Dubova", d.financingEventFixationEnd, "12.03.2031"],
    ]);
    expect(rows[1].amount).toBeNull();
  });
});
