// ADR 0103 (#31): the Dashboard "Financing & upcoming" panel model.
import { describe, it, expect } from "vitest";
import {
  debtResettingWithin,
  edate,
  impliedMaturity,
  isoDate,
  money,
  portfolioOutputs,
  type Portfolio,
} from "../../../engine";
import { mixed } from "../../../engine/__tests__/support/mixed";
import { assumptions, portfolio } from "../../../engine/__tests__/support/seed";
import { en } from "../../../i18n/en";
import { cs } from "../../../i18n/cs";
import { ru } from "../../../i18n/ru";
import { fmtDate } from "../../../lib/format";
import { financingLabels, financingPanel } from "../financing";

function impliedMaturityOf(id: string) {
  const b = portfolio.mortgages.find((x) => x.id === id);
  const d = b && impliedMaturity(b);
  if (!d) throw new Error(`no maturity for ${id}`);
  return d;
}

function run(p: Portfolio, asOf = assumptions.baseDate) {
  return portfolioOutputs(p, assumptions, asOf);
}

describe("financingPanel (ADR 0103)", () => {
  const out = run(portfolio);

  it("next reset is the earliest upcoming fixation end, with its property and balance", () => {
    const m = financingPanel(
      out.financing,
      portfolio,
      out.kpis,
      "nominal",
      "3",
      en,
    );
    const lipova = out.financing.resets.find((r) => r.blockId === "m-lipova");
    expect(m.hasLoans).toBe(true);
    expect(m.nextReset).toEqual({
      date: "15.01.2029",
      propertyId: "lipova",
      propertyName: "Byt Lipova",
      balance: lipova?.balance,
    });
  });

  it("debt resetting follows the chosen window", () => {
    for (const w of ["1", "3", "5"] as const) {
      const m = financingPanel(
        out.financing,
        portfolio,
        out.kpis,
        "nominal",
        w,
        en,
      );
      expect(m.resetting).toEqual(
        debtResettingWithin(out.financing, Number(w)),
      );
    }
  });

  it("total interest follows the lens", () => {
    const nominal = financingPanel(
      out.financing,
      portfolio,
      out.kpis,
      "nominal",
      "3",
      en,
    );
    const real = financingPanel(
      out.financing,
      portfolio,
      out.kpis,
      "real",
      "3",
      en,
    );
    expect(nominal.totalInterest).toBe(out.kpis.totalInterest);
    expect(real.totalInterest).toBe(out.kpis.totalInterestReal);
    // Balances do not: they stay nominal in both lenses.
    expect(real.nextReset?.balance).toBe(nominal.nextReset?.balance);
  });

  it("labels events in each language and links them to the property", () => {
    const p = {
      ...portfolio,
      leases: portfolio.leases.filter((l) => l.id !== "l-lipova-2"),
    };
    const o = run(p);
    for (const [t, label] of [
      [en, en.dashboard.financingEventLeaseEnd],
      [cs, cs.dashboard.financingEventLeaseEnd],
      [ru, ru.dashboard.financingEventLeaseEnd],
    ] as const) {
      const m = financingPanel(o.financing, p, o.kpis, "nominal", "3", t);
      expect(m.events).toEqual([
        {
          date: "30.08.2026",
          propertyId: "lipova",
          propertyName: "Byt Lipova",
          label,
          amount: null,
        },
      ]);
    }
  });

  it("a fixation-end event carries its balance", () => {
    const o = run(portfolio, isoDate("2028-06-01"));
    const m = financingPanel(
      o.financing,
      portfolio,
      o.kpis,
      "nominal",
      "3",
      en,
    );
    const e = m.events.find(
      (x) => x.label === en.dashboard.financingEventFixationEnd,
    );
    expect(e?.date).toBe(fmtDate(isoDate("2029-01-15")));
    expect(e?.amount).toBe(m.nextReset?.balance);
  });

  it("labels a modelled payoff and a development completion", () => {
    const payoff = edate(impliedMaturityOf("m-javorova"), -6);
    const o = run(portfolio, payoff);
    const m = financingPanel(
      o.financing,
      portfolio,
      o.kpis,
      "nominal",
      "3",
      en,
    );
    expect(m.events.map((e) => e.label)).toContain(
      en.dashboard.financingEventLoanPayoff,
    );
    const d = run(mixed, isoDate("2026-12-01"));
    const dev = financingPanel(d.financing, mixed, d.kpis, "nominal", "3", en);
    expect(dev.events).toContainEqual({
      date: "20.08.2027",
      propertyId: "dev",
      propertyName: "Dev unit",
      label: en.dashboard.financingEventDevCompletion,
      amount: null,
    });
  });

  it("falls back to the property id when the name is not in the portfolio", () => {
    const m = financingPanel(
      out.financing,
      { ...portfolio, properties: [] },
      out.kpis,
      "nominal",
      "3",
      en,
    );
    expect(m.nextReset?.propertyName).toBe("lipova");
  });

  it("lists at most five events and counts the rest", () => {
    const props = Array.from({ length: 7 }, (_, i) => ({
      ...portfolio.properties[0],
      id: `p${i}`,
      name: `P${i}`,
    }));
    const p: Portfolio = {
      ...portfolio,
      properties: props,
      mortgages: [],
      valuations: [],
      holdingCosts: [],
      leases: props.map((x, i) => ({
        id: `l${i}`,
        propertyId: x.id,
        startDate: isoDate("2026-01-01"),
        endDate: isoDate(`2026-${String(7 + (i % 5)).padStart(2, "0")}-20`),
        monthlyRent: portfolio.leases[0].monthlyRent,
      })),
    };
    const o = run(p);
    const m = financingPanel(o.financing, p, o.kpis, "nominal", "3", en);
    expect(m.hasLoans).toBe(false);
    expect(m.nextReset).toBeNull();
    expect(m.events).toHaveLength(5);
    expect(m.moreEvents).toBe(2);
  });
});

describe("financingLabels (ADR 0103)", () => {
  it("nominal lens", () => {
    expect(financingLabels(en, "nominal", "3", 30)).toEqual({
      balanceAtReset: "Debt at that reset",
      resettingWithin: "Debt resetting within 3 years",
      totalInterest: "Total interest (Yrs 1–30)",
    });
  });

  it("real lens: balances say nominal, total interest says real", () => {
    expect(financingLabels(en, "real", "1", 30)).toEqual({
      balanceAtReset: "Debt at that reset (nominal)",
      resettingWithin: "Debt resetting within 1 year (nominal)",
      totalInterest: "Total interest (Yrs 1–30, real)",
    });
  });

  it("Czech and Russian inflect the window", () => {
    expect(financingLabels(cs, "nominal", "1", 30).resettingWithin).toBe(
      "Dluh se změnou sazby do 1 roku",
    );
    expect(financingLabels(cs, "nominal", "5", 30).resettingWithin).toBe(
      "Dluh se změnou sazby do 5 let",
    );
    expect(financingLabels(ru, "nominal", "3", 30).resettingWithin).toBe(
      "Долг со сменой ставки в течение 3 лет",
    );
  });
});

// ADR 0116 §9: interest saved by prepayments, total plus each property, nominal.
describe("financingPanel interest saved (ADR 0116)", () => {
  const prepaid = (ids: string[]): Portfolio => ({
    ...portfolio,
    mortgages: portfolio.mortgages.map((m) =>
      ids.includes(m.propertyId)
        ? {
            ...m,
            prepayments: [
              {
                date: isoDate("2029-01-15"),
                amount: money(300000),
                effect: "lowerInstalment" as const,
              },
            ],
          }
        : m,
    ),
  });
  const panel = (p: Portfolio, mode: "nominal" | "real" = "nominal") => {
    const o = run(p);
    return { m: financingPanel(o.financing, p, o.kpis, mode, "3", en), o };
  };

  it("is null when no property has a prepayment", () => {
    expect(panel(portfolio).m.interestSaved).toBeNull();
  });

  it("is the sum of the properties' figures, largest first, the same in both lenses", () => {
    const p = prepaid(["javorova", "lipova"]);
    const { m, o } = panel(p);
    const of = (id: string) =>
      o.financing.loans.find((l) => l.propertyId === id)!.interestSaved!;
    const rows = m.interestSaved!.properties;
    expect(rows.map((r) => r.propertyId).sort()).toEqual([
      "javorova",
      "lipova",
    ]);
    expect(rows[0]!.amount.greaterThanOrEqualTo(rows[1]!.amount)).toBe(true);
    expect(rows.find((r) => r.propertyId === "lipova")).toMatchObject({
      propertyName: "Byt Lipova",
      amount: of("lipova"),
    });
    expect(m.interestSaved!.total.toFixed(6)).toBe(
      of("javorova").plus(of("lipova")).toFixed(6),
    );
    expect(panel(p, "real").m.interestSaved).toEqual(m.interestSaved);
  });
});
