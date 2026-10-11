// ADR 0134 (#181): the first loan of a property already owned at baseDate, drawn after
// baseDate, pays its initial principal to the owner as cash in, in the projection year it
// is drawn (as ADR 0119 §5 does for a future buy). Its tranches do not: they pay the
// builder. Only the KPIs move; the projection rows are unchanged. Hand-calculated
// figures on the seed plus one property bought in 2020 for cash.
import { describe, it, expect } from "vitest";
import { irrResult, portfolioKpis } from "../kpis";
import { cpiIndex, portfolioProjection } from "../projections";
import { propertySchedules } from "../schedule";
import { acquisitionSummary, laterFirstLoan } from "../acquisition";
import { acquisitionOutflows } from "../ownerCash";
import { turnOnYear } from "../yearGrid";
import { isoDate } from "../dates";
import { money, rate } from "../brands";
import { ZERO, type Decimal } from "../../lib/money";
import type { Assumptions, MortgageBlock, Portfolio, Property } from "../types";
import { assumptions, portfolio } from "./support/seed";
import { RATIO, expectKc, near } from "./support/tolerance";

const N = assumptions.horizonYears;
const PRINCIPAL = 3_000_000;

const loan = (patch: Partial<MortgageBlock> = {}): MortgageBlock =>
  ({
    id: "m-owned",
    propertyId: "owned",
    startDate: isoDate("2027-01-31"), // baseDate 2026-06-07 → projection year 1
    initialPrincipal: money(PRINCIPAL),
    fixationYears: 5,
    interestRatePa: rate("0.045"),
    monthlyInstalment: money("17000"),
    ...patch,
  }) as MortgageBlock;

/** The seed plus one property owned since 2020, with its own blocks. */
function withOwned(
  blocks: MortgageBlock[] = [loan()],
  patch: Partial<Property> = {},
): Portfolio {
  const owned: Property = {
    id: "owned",
    name: "Byt Kralovska",
    purchaseDate: isoDate("2020-03-01"),
    purchasePrice: money(4_000_000),
    ...patch,
  };
  return {
    ...portfolio,
    properties: [...portfolio.properties, owned],
    mortgages: [...portfolio.mortgages, ...blocks],
    valuations: [
      ...portfolio.valuations,
      {
        id: "v-owned",
        propertyId: "owned",
        validFrom: isoDate("2020-03-01"),
        marketValue: money(5_000_000),
      },
    ],
  };
}

/** The cash outside net cash flow: Σ net CF − cumulative net CF. Negative = cash in. */
function outflow(p: Portfolio, a: Assumptions = assumptions): Decimal {
  const sum = portfolioProjection(p, a)
    .slice(1)
    .reduce((s, y) => s.plus(y.netCashFlow), ZERO);
  return sum.minus(portfolioKpis(p, a).cumulativeNetCashFlow);
}

describe("ADR 0134: an owned property's first loan after baseDate is cash in", () => {
  it("its initial principal comes back in the year it is drawn", () => {
    expectKc(outflow(withOwned()), -PRINCIPAL, "3 M in");
  });

  it("levered IRR takes the principal in its draw year", () => {
    const p = withOwned();
    const proj = portfolioProjection(p, assumptions);
    const vector = proj.map((y, t) => {
      if (t === 0) return y.equity.negated();
      const cf = t === 1 ? y.netCashFlow.plus(PRINCIPAL) : y.netCashFlow;
      return t === N ? cf.plus(y.equity) : cf;
    });
    const want = irrResult(vector).rate;
    const got = portfolioKpis(p, assumptions).leveredIrrNominal;
    if (!want || !got) throw new Error("IRR expected");
    near(got, want.toNumber(), RATIO, "IRR");
  });

  it("real lens: the principal deflated by its year's CPI", () => {
    const p = withOwned();
    const proj = portfolioProjection(p, assumptions);
    const cpi = cpiIndex(assumptions);
    const sumReal = proj
      .slice(1)
      .reduce((s, y, i) => s.plus(y.netCashFlow.div(cpi[i + 1])), ZERO);
    expectKc(
      portfolioKpis(p, assumptions).cumulativeNetCashFlowReal.minus(sumReal),
      money(PRINCIPAL).div(cpi[1]).toNumber(),
      "3 M / CPI_1",
    );
  });

  it("a later draw year books it there", () => {
    // 2029-03-01 is grid month 33 → projection year 3: the IRR vector pins the year.
    const p = withOwned([loan({ startDate: isoDate("2029-03-01") })]);
    expectKc(outflow(p), -PRINCIPAL, "3 M in");
    const proj = portfolioProjection(p, assumptions);
    const vector = proj.map((y, t) => {
      if (t === 0) return y.equity.negated();
      const cf = t === 3 ? y.netCashFlow.plus(PRINCIPAL) : y.netCashFlow;
      return t === N ? cf.plus(y.equity) : cf;
    });
    const want = irrResult(vector).rate;
    const got = portfolioKpis(p, assumptions).leveredIrrNominal;
    if (!want || !got) throw new Error("IRR expected");
    near(got, want.toNumber(), 1e-12, "IRR, year 3");
  });

  it("bought on baseDate, loan drawn the next day: owned, so cash in", () => {
    const p = withOwned([loan({ startDate: isoDate("2026-06-08") })], {
      purchaseDate: isoDate("2026-06-07"),
    });
    expectKc(outflow(p), -PRINCIPAL, "3 M in");
  });

  it("a loan drawn on or before baseDate is opening debt, not cash", () => {
    const p = withOwned([loan({ startDate: isoDate("2026-06-07") })]);
    expectKc(outflow(p), 0, "none");
  });

  it("a loan drawn after the horizon gives no cash in", () => {
    const a = { ...assumptions, horizonYears: 5 };
    const p = withOwned([loan({ startDate: isoDate("2032-01-31") })]);
    expectKc(outflow(p, a), 0, "none");
  });

  // ADR 0166 (owner, 2026-10-09): a development loan pays the developer, not the owner;
  // on a flat owned at baseDate it is committed debt from baseDate instead.
  it("a development loan drawn after baseDate brings no cash in (ADR 0166)", () => {
    const dev = loan({
      loanTermYears: 30,
      draws: [
        { date: isoDate("2027-09-01"), amount: money(1_000_000) },
        { date: isoDate("2028-03-01"), amount: money(500_000) },
      ],
      completionDate: isoDate("2028-03-01"),
    } as Partial<MortgageBlock>);
    expectKc(outflow(withOwned([dev])), 0, "none");
  });

  it("a successor of a loan drawn before baseDate is a refinance, not a first loan", () => {
    // The 2025 loan is the first one; its 2028 successor brings only the D-47 cash.
    const first = loan({ id: "m-first", startDate: isoDate("2025-01-31") });
    const refi = loan({
      id: "m-refi",
      startDate: isoDate("2028-01-31"),
      initialPrincipal: money(PRINCIPAL),
    });
    const p = withOwned([first, refi]);
    const [r] =
      propertySchedules(p.mortgages, ["owned"], assumptions).get("owned")
        ?.refinances ?? [];
    if (!r) throw new Error("expected a handover");
    // Cash in = the refinance difference only: 3 M − the balance it pays off.
    expect(r.paidOff.greaterThan(ZERO)).toBe(true);
    expectKc(
      outflow(p),
      r.drawn.minus(r.paidOff).negated().toNumber(),
      "D-47 cash only",
    );
  });

  it("a deactivated property brings nothing", () => {
    expectKc(outflow(withOwned([loan()], { active: false })), 0, "none");
  });

  it("a cash buy just before baseDate whose loan follows it: the loan is cash in", () => {
    // Bought 2026-05-01, loan drawn 2026-07-01: inside the 90-day window, but owned at
    // baseDate, so equity0 holds the full value and the loan comes back as cash.
    const p = withOwned([loan({ startDate: isoDate("2026-07-01") })], {
      purchaseDate: isoDate("2026-05-01"),
    });
    expectKc(outflow(p), -PRINCIPAL, "3 M in");
  });
});

// ADR 0176 (#289): a future buy's first loan dated on or before baseDate is always its
// acquisition loan (ADR 0119 §3; a development loan always is, ADR 0168), so it never
// brings cash in year 0. A later first loan starts > 90 days after the purchase, so its
// cash lands in or after the turn-on year. Tripwire for ownerCash's year-0 case.
describe("ADR 0176 (#289): a future buy's later first loan never brings year-0 cash", () => {
  const FUTURE = { purchaseDate: isoDate("2028-03-15") };
  const ownedOf = (p: Portfolio): Property => {
    const prop = p.properties.find((x) => x.id === "owned");
    if (!prop) throw new Error("expected the property");
    return prop;
  };

  it("a plain first loan dated before baseDate is the acquisition loan", () => {
    const p = withOwned([loan({ startDate: isoDate("2025-05-10") })], FUTURE);
    const prop = ownedOf(p);
    expect(laterFirstLoan(prop, p, assumptions)).toBeUndefined();
    expect(acquisitionSummary(prop, p, assumptions).loan).not.toBeNull();
    expectKc(
      acquisitionOutflows([prop], p, assumptions)[0] ?? ZERO,
      0,
      "year 0",
    );
  });

  it("a development first loan dated before baseDate is the acquisition loan", () => {
    const dev = loan({
      startDate: isoDate("2025-05-10"),
      loanTermYears: 30,
      draws: [
        { date: isoDate("2027-09-01"), amount: money(1_000_000) },
        { date: isoDate("2028-03-01"), amount: money(500_000) },
      ],
      completionDate: isoDate("2028-03-01"),
    } as Partial<MortgageBlock>);
    const p = withOwned([dev], FUTURE);
    const prop = ownedOf(p);
    expect(laterFirstLoan(prop, p, assumptions)).toBeUndefined();
    expect(acquisitionSummary(prop, p, assumptions).loan).not.toBeNull();
    expectKc(
      acquisitionOutflows([prop], p, assumptions)[0] ?? ZERO,
      0,
      "year 0",
    );
  });

  it("a plain first loan > 90 days after the purchase is cash in its own year", () => {
    const late = loan({ startDate: isoDate("2028-07-01") });
    const p = withOwned([late], FUTURE);
    const prop = ownedOf(p);
    expect(laterFirstLoan(prop, p, assumptions)).toBe(late);
    // baseDate 2026-06-07: bought in year 2, the loan drawn in year 3.
    expect(turnOnYear(prop.purchaseDate, assumptions)).toBe(2);
    expect(turnOnYear(late.startDate, assumptions)).toBe(3);
    const out = acquisitionOutflows([prop], p, assumptions);
    expectKc(out[0] ?? ZERO, 0, "year 0");
    expectKc(
      out[2] ?? ZERO,
      acquisitionSummary(prop, p, assumptions).outflow.toNumber(),
      "down payment",
    );
    expectKc(out[3] ?? ZERO, -PRINCIPAL, "3 M in");
  });
});
