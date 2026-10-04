// ADR 0109: a prepayment and its fee are owner cash outside debt service and net cash
// flow (like an acquisition): the projection carries them in their own columns, and
// cumulative cash flow and the IRR subtract them. Principal repaid includes them.
import { describe, it, expect } from "vitest";
import { money } from "../brands";
import { isoDate } from "../dates";
import { ZERO, type Decimal } from "../../lib/money";
import { portfolioProjection, buildCpiIndex } from "../projections";
import { realProjection } from "../real";
import { portfolioKpis } from "../kpis";
import { financingExposure } from "../financing";
import { schedulesByProperty } from "../schedule";
import type {
  MortgageBlock,
  Portfolio,
  PrepaymentEffect,
  ProjectionYear,
} from "../types";
import { BASE_DATE, assumptions, portfolio } from "./support/seed";

/** The seed with Javorova prepaying 500,000 Kč (+ fee) on its 2031-01-17 refix. */
function prepaid(
  effect: PrepaymentEffect,
  p: Portfolio = portfolio,
): Portfolio {
  return {
    ...p,
    mortgages: p.mortgages.map((m): MortgageBlock =>
      m.propertyId === "javorova"
        ? ({
            ...m,
            prepayments: [
              {
                date: isoDate("2031-01-17"),
                amount: money(500000),
                effect,
                fee: money(2000),
              },
            ],
          } as MortgageBlock)
        : m,
    ),
  };
}

const javorovaOnly: Portfolio = {
  ...portfolio,
  properties: portfolio.properties.filter((p) => p.id === "javorova"),
  mortgages: portfolio.mortgages.filter((m) => m.propertyId === "javorova"),
  valuations: portfolio.valuations.filter((v) => v.propertyId === "javorova"),
  leases: portfolio.leases.filter((l) => l.propertyId === "javorova"),
  holdingCosts: portfolio.holdingCosts.filter(
    (h) => h.propertyId === "javorova",
  ),
};

const total = (ys: ProjectionYear[], f: (y: ProjectionYear) => Decimal) =>
  ys.slice(1).reduce((s, y) => s.plus(f(y)), ZERO);

describe("ADR 0109: prepayments in the projection", () => {
  const base = portfolioProjection(portfolio, assumptions);
  const proj = portfolioProjection(prepaid("shortenTerm"), assumptions);

  it("lands in the year of its grid month (56 ⇒ year 5), with its fee", () => {
    expect(proj[5].prepaid.toFixed(0)).toBe("500000");
    expect(proj[5].prepaymentFees.toFixed(0)).toBe("2000");
    expect(total(proj, (y) => y.prepaid).toFixed(0)).toBe("500000");
    expect(proj[0].prepaid.isZero()).toBe(true);
    expect(base.every((y) => y.prepaid.isZero())).toBe(true);
  });

  it("stays out of debt service, net cash flow and DSCR", () => {
    const near = (a: Decimal, b: Decimal) =>
      expect(a.minus(b).abs().toNumber()).toBeLessThan(1e-9);
    for (const y of proj.slice(1)) {
      near(y.debtService, y.interest.plus(y.principal));
      near(y.netCashFlow, y.noi.minus(y.debtService));
    }
    // Year 5's payments before the prepayment are unchanged.
    expect(proj[5].noi.equals(base[5].noi)).toBe(true);
  });

  it("explains the balance move with principal, prepaid and draws", () => {
    for (let t = 1; t < proj.length; t++) {
      const expected = proj[t - 1].balance
        .minus(proj[t].principal)
        .minus(proj[t].prepaid)
        .plus(proj[t].draws);
      expect(proj[t].balance.minus(expected).abs().toNumber()).toBeLessThan(
        1e-6,
      );
    }
  });

  it("deflates prepaid and fees in the real lens", () => {
    const cpi = buildCpiIndex(assumptions);
    const real = realProjection(proj, cpi);
    expect(real[5].prepaid.equals(proj[5].prepaid.div(cpi[5]))).toBe(true);
    expect(
      real[5].prepaymentFees.equals(proj[5].prepaymentFees.div(cpi[5])),
    ).toBe(true);
  });
});

describe("ADR 0109: prepayments in the KPIs", () => {
  const baseKpis = portfolioKpis(portfolio, assumptions);
  const p = prepaid("shortenTerm");
  const kpis = portfolioKpis(p, assumptions);
  const proj = portfolioProjection(p, assumptions);

  it("cumulative cash flow subtracts the prepayment and its fee", () => {
    const expected = total(proj, (y) =>
      y.netCashFlow.minus(y.prepaid).minus(y.prepaymentFees),
    );
    expect(
      kpis.cumulativeNetCashFlow.minus(expected).abs().toNumber(),
    ).toBeLessThan(1e-6);
  });

  it("principal repaid still equals the starting debt", () => {
    expect(kpis.totalPrincipalRepaid.toFixed(2)).toBe(
      baseKpis.totalPrincipalRepaid.toFixed(2),
    );
    expect(kpis.totalPrincipalRepaid.toFixed(0)).toBe("9515405");
  });

  it("changes the IRR, keeps the first positive cash-flow year operating-only", () => {
    expect(kpis.leveredIrrNominal).not.toBeNull();
    expect(
      kpis.leveredIrrNominal?.equals(baseKpis.leveredIrrNominal ?? ZERO),
    ).toBe(false);
    // The prepayment year's own net cash flow is not reduced by the outflow.
    const firstPositive = proj
      .slice(1)
      .find((y) => y.netCashFlow.greaterThan(ZERO));
    expect(kpis.firstCashFlowPositiveYear).toBe(
      firstPositive?.calendarYear ?? null,
    );
  });

  it("a shorter term makes the loan debt-free earlier", () => {
    expect(portfolioKpis(javorovaOnly, assumptions).debtFreeYear).toBe(2051);
    expect(
      portfolioKpis(prepaid("shortenTerm", javorovaOnly), assumptions)
        .debtFreeYear,
    ).toBe(2043);
    expect(
      portfolioKpis(prepaid("lowerInstalment", javorovaOnly), assumptions)
        .debtFreeYear,
    ).toBe(2051);
  });
});

describe("ADR 0109: the modelled payoff moves with a shorter term", () => {
  it("payoff date 2043-03-17 after the shortenTerm prepayment", () => {
    const p = prepaid("shortenTerm");
    const ids = p.properties.map((x) => x.id);
    const schedules = schedulesByProperty(p.mortgages, ids, assumptions);
    const fx = financingExposure(p, assumptions, schedules, BASE_DATE);
    const loan = fx.loans.find((l) => l.propertyId === "javorova");
    expect(loan?.payoffDate?.toISOString().slice(0, 10)).toBe("2043-03-17");
  });
});
