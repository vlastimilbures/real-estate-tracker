// ADR 0134 (#181): the first loan of a property already owned at baseDate, drawn after
// baseDate, pays its initial principal to the owner as cash in, in the projection year it
// is drawn (as ADR 0119 §5 does for a future buy). Its tranches do not: they pay the
// builder. Only the KPIs move; the projection rows are unchanged. Hand-calculated
// figures on the seed plus one property bought in 2020 for cash.
import { describe, it, expect } from "vitest";
import { irr, portfolioKpis } from "../kpis";
import { portfolioProjection } from "../projections";
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
    const want = irr(vector);
    const got = portfolioKpis(p, assumptions).leveredIrrNominal;
    if (!want || !got) throw new Error("IRR expected");
    near(got, want.toNumber(), RATIO, "IRR");
  });

  it("a later draw year books it there", () => {
    // 2029-03-01 is grid month 33 → projection year 3; the sum is the same.
    const p = withOwned([loan({ startDate: isoDate("2029-03-01") })]);
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

  it("only the initial principal comes back, not the tranches", () => {
    const dev = loan({
      loanTermYears: 30,
      draws: [
        { date: isoDate("2027-09-01"), amount: money(1_000_000) },
        { date: isoDate("2028-03-01"), amount: money(500_000) },
      ],
      completionDate: isoDate("2028-03-01"),
    } as Partial<MortgageBlock>);
    expectKc(outflow(withOwned([dev])), -PRINCIPAL, "3 M in");
  });

  it("a successor of a loan drawn before baseDate is a refinance, not a first loan", () => {
    // The 2025 loan is the first one; its 2028 successor brings only the D-47 cash.
    const first = loan({ id: "m-first", startDate: isoDate("2025-01-31") });
    const refi = loan({
      id: "m-refi",
      startDate: isoDate("2028-01-31"),
      initialPrincipal: money(PRINCIPAL),
    });
    const withRefi = outflow(withOwned([first, refi]));
    const kpis = portfolioKpis(withOwned([first, refi]), assumptions);
    const proj = portfolioProjection(withOwned([first, refi]), assumptions);
    // Cash in = the refinance difference only: 3 M − the balance it pays off.
    expect(withRefi.isNegative()).toBe(true);
    expect(withRefi.abs().lessThan(PRINCIPAL)).toBe(true);
    expect(kpis.cumulativeNetCashFlow.toString()).toBe(
      proj
        .slice(1)
        .reduce((s, y) => s.plus(y.netCashFlow), ZERO)
        .minus(withRefi)
        .toString(),
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
