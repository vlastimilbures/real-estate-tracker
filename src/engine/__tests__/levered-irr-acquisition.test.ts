// A property bought after baseDate must charge the investor a down-payment outflow in
// its turn-on year, so levered IRR / cumulative cash flow aren't flattered by free
// terminal equity. The isolation tests vary only the buy's entered
// `funding.transactionCosts` (a strictly-monotonic input to the injected outflow) so the
// direction can't pass for an unrelated reason; parity (cashOutsideNetCf all-zero on the
// all-owned seed) is covered by projection.test.ts and re-asserted here.
import { describe, it, expect } from "vitest";
import { portfolioKpis } from "../kpis";
import { portfolioProjection } from "../projections";
import { isoDate } from "../dates";
import { assumptions, portfolio, PARITY } from "./support/seed";
import type { Portfolio, Property } from "../types";
import { rate } from "../brands";
import { money } from "../brands";
import { ZERO } from "../../lib/money";
import { expectKc } from "./support/tolerance";
import { mortgageBlock } from "../loanBlock";

const PURCHASE = isoDate("2029-01-01"); // baseDate 2026-06-07 → tStart = 3
const FUTURE_VALUE = 6_200_000;
const PRINCIPAL = 2_000_000;

const slovanske: Property = {
  id: "slovanske",
  name: "Byt Slovanske",
  purchaseDate: PURCHASE,
  purchasePrice: money("5800000"),
};

const withFuture: Portfolio = {
  properties: [...portfolio.properties, slovanske],
  mortgages: [
    ...portfolio.mortgages,
    mortgageBlock({
      id: "m-slovanske",
      propertyId: "slovanske",
      startDate: PURCHASE,
      initialPrincipal: money(PRINCIPAL),
      fixationYears: 5,
      interestRatePa: rate("0.04"),
      monthlyInstalment: money("30000"), // fully amortizes in-window
    }),
  ],
  valuations: [
    ...portfolio.valuations,
    {
      id: "v-slovanske",
      propertyId: "slovanske",
      validFrom: PURCHASE,
      marketValue: money(FUTURE_VALUE),
    },
  ],
  leases: [
    ...portfolio.leases,
    {
      id: "l-slovanske",
      propertyId: "slovanske",
      startDate: PURCHASE,
      monthlyRent: money("20000"),
    },
  ],
  holdingCosts: portfolio.holdingCosts,
};

/** The future buy with entered transaction costs (ADR 0119 §5, ADR 0234). */
const withCosts = (kc: number): Portfolio => ({
  ...withFuture,
  properties: withFuture.properties.map((p) =>
    p.id === "slovanske"
      ? { ...p, funding: { transactionCosts: money(kc) } }
      : p,
  ),
});

describe("levered IRR — future-acquisition outflow", () => {
  it("a higher acquisition cost strictly lowers levered IRR (the outflow lands)", () => {
    const base = portfolioKpis(withCosts(0), assumptions);
    const taxed = portfolioKpis(withCosts(348_000), assumptions);
    expect(base.leveredIrrNominal).not.toBeNull();
    expect(taxed.leveredIrrNominal).not.toBeNull();
    // a bigger down-payment outflow at tStart ⇒ lower return
    expect(taxed.leveredIrrNominal!.lessThan(base.leveredIrrNominal!)).toBe(
      true,
    );
    expect(taxed.leveredIrrReal!.lessThan(base.leveredIrrReal!)).toBe(true);
  });

  it("a higher acquisition cost strictly lowers cumulative net cash flow", () => {
    const base = portfolioKpis(withCosts(0), assumptions);
    const taxed = portfolioKpis(withCosts(348_000), assumptions);
    expect(
      taxed.cumulativeNetCashFlow.lessThan(base.cumulativeNetCashFlow),
    ).toBe(true);
  });

  it("charges the down payment once: cumulative CF = Σ net CF − outflow", () => {
    // The seed has no refinance and no prepayment, so the only cash outside net cash
    // flow is the future buy's outflow (#103, R2-10): price − principal, plus the
    // entered transaction costs (ADR 0119 §5; the 6.2 M valuation does not count).
    const sumNetCf = (p: Portfolio) =>
      portfolioProjection(p, assumptions)
        .slice(1)
        .reduce((s, y) => s.plus(y.netCashFlow), ZERO);
    for (const [costs, outflow] of [
      [0, 3_800_000],
      [348_000, 4_148_000],
    ] as const) {
      const p = withCosts(costs);
      expectKc(
        sumNetCf(p).minus(portfolioKpis(p, assumptions).cumulativeNetCashFlow),
        outflow,
        `outflow at costs ${costs}`,
      );
    }
  });

  it("is a strict no-op on the all-owned seed (parity levered IRR & cumulative CF unchanged)", () => {
    const k = portfolioKpis(portfolio, assumptions);
    expect(k.leveredIrrNominal!.toNumber()).toBeCloseTo(
      PARITY.kpis.leveredIrrNominal,
      5,
    );
    expect(k.cumulativeNetCashFlow.toNumber()).toBeCloseTo(
      PARITY.kpis.cumulativeNetCashFlow,
      0,
    );
  });

  it("zero-debt portfolio reports debtFreeYear null; the seed still reports 2052", () => {
    const noDebt: Portfolio = { ...portfolio, mortgages: [] };
    expect(portfolioKpis(noDebt, assumptions).debtFreeYear).toBeNull();
    expect(portfolioKpis(portfolio, assumptions).debtFreeYear).toBe(2052);
  });
});
