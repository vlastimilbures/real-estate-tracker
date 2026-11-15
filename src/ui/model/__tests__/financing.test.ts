// ADR 0103 (#31): the Dashboard "Financing & upcoming" panel model.
import { describe, it, expect } from "vitest";
import {
  debtResettingWithin,
  isoDate,
  money,
  portfolioOutputs,
  type Portfolio,
} from "../../../engine";
import { assumptions, portfolio } from "../../../engine/__tests__/support/seed";
import { en } from "../../../i18n/en";
import { cs } from "../../../i18n/cs";
import { ru } from "../../../i18n/ru";
import { D } from "../../../lib/money";
import {
  financingLabels,
  financingPanel,
  interestSavedShown,
  type InterestSavedShown,
} from "../financing";

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
    );
    const real = financingPanel(
      out.financing,
      portfolio,
      out.kpis,
      "real",
      "3",
    );
    expect(nominal.totalInterest).toBe(out.kpis.totalInterest);
    expect(real.totalInterest).toBe(out.kpis.totalInterestReal);
    // Balances do not: they stay nominal in both lenses.
    expect(real.nextReset?.balance).toBe(nominal.nextReset?.balance);
  });

  it("falls back to the property id when the name is not in the portfolio", () => {
    const m = financingPanel(
      out.financing,
      { ...portfolio, properties: [] },
      out.kpis,
      "nominal",
      "3",
    );
    expect(m.nextReset?.propertyName).toBe("lipova");
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

/** A shown figure that must be an amount. */
function amount(x: InterestSavedShown) {
  if (x === "n/a") throw new Error("expected an amount");
  return x;
}

// ADR 0130: one display rule for the property page and the Dashboard.
describe("interestSavedShown (ADR 0130)", () => {
  it("hides null and zero, shows more, and n/a in place of a negative figure", () => {
    expect(interestSavedShown(null)).toBeNull();
    expect(interestSavedShown(D(0))).toBeNull();
    expect(interestSavedShown(D("-0"))).toBeNull();
    expect(interestSavedShown(D("0.000001"))).toEqual(D("0.000001"));
    expect(interestSavedShown(D("264031.42"))).toEqual(D("264031.42"));
    expect(interestSavedShown(D("-0.01"))).toBe("n/a");
    expect(interestSavedShown(D("-433551.87"))).toBe("n/a");
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
    return { m: financingPanel(o.financing, p, o.kpis, mode, "3"), o };
  };

  it("is null when no property has a prepayment", () => {
    expect(panel(portfolio).m.interestSaved).toBeNull();
  });

  /** The panel with Javorova's figure replaced by `javorova`. */
  const withJavorova = (javorova: string, ids = ["lipova"]) => {
    const p = prepaid(ids);
    const o = run(p);
    const fx = {
      ...o.financing,
      loans: o.financing.loans.map((l) =>
        l.propertyId === "javorova" ? { ...l, interestSaved: D(javorova) } : l,
      ),
    };
    return { m: financingPanel(fx, p, o.kpis, "nominal", "3"), o };
  };
  const lipovaSaved = (o: ReturnType<typeof run>) =>
    o.financing.loans.find((l) => l.propertyId === "lipova")!.interestSaved!;

  it("lists a negative figure last as n/a, outside the total (ADR 0130)", () => {
    const { m, o } = withJavorova("-433551.87");
    expect(m.interestSaved!.properties).toEqual([
      expect.objectContaining({ propertyId: "lipova", amount: lipovaSaved(o) }),
      expect.objectContaining({ propertyId: "javorova", amount: "n/a" }),
    ]);
    expect(m.interestSaved!.total).toEqual(lipovaSaved(o));
  });

  it("is n/a in total when every figure is negative (ADR 0130)", () => {
    const { m } = withJavorova("-1", []);
    expect(m.interestSaved).toEqual({
      total: "n/a",
      properties: [expect.objectContaining({ propertyId: "javorova" })],
    });
  });

  it("leaves out a zero figure, as the property page does (ADR 0130)", () => {
    // E.g. a prepayment at a refix: the successor's typed principal already holds it.
    const { m } = withJavorova("0");
    expect(m.interestSaved!.properties.map((r) => r.propertyId)).toEqual([
      "lipova",
    ]);
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
    expect(
      amount(rows[0]!.amount).greaterThanOrEqualTo(amount(rows[1]!.amount)),
    ).toBe(true);
    expect(rows.find((r) => r.propertyId === "lipova")).toMatchObject({
      propertyName: "Byt Lipova",
      amount: of("lipova"),
    });
    expect(amount(m.interestSaved!.total).toFixed(6)).toBe(
      of("javorova").plus(of("lipova")).toFixed(6),
    );
    expect(panel(p, "real").m.interestSaved).toEqual(m.interestSaved);
  });
});
