// ADR 0124 (#104): a loan that runs before a future purchase date (an off-plan loan drawn
// at contract, the purchase date being the handover) is paid by the owner in the years
// before the property turns on. Those years stay empty projection rows, but their
// interest, principal, prepaid and fees are owner cash out in the KPIs, beside the down
// payment (ADR 0119). Hand-calculated figures: a flat 25,000 Kč instalment, no reset
// inside the window that matters.
import { describe, it, expect } from "vitest";
import { irr, portfolioKpis } from "../kpis";
import { cpiIndex, portfolioProjection } from "../projections";
import { propertySchedules } from "../schedule";
import { isoDate } from "../dates";
import { money, rate } from "../brands";
import { ZERO, type Decimal } from "../../lib/money";
import type { Assumptions, MortgageBlock, Portfolio, Property } from "../types";
import { assumptions as seedAssumptions, portfolio } from "./support/seed";
import { expectKc } from "./support/tolerance";

const assumptions: Assumptions = { ...seedAssumptions, horizonYears: 10 };
const N = assumptions.horizonYears;
const PURCHASE = isoDate("2029-01-15"); // baseDate 2026-06-07 → tStart 3
const EARLY = isoDate("2026-01-10"); // before baseDate: running in grid month 1
const PRICE = 6_000_000;
const PRINCIPAL = 4_000_000;
const DOWN_PAYMENT = PRICE - PRINCIPAL; // no cost rate, no record (ADR 0119 §5)
const INSTALMENT = 25_000;

const loan = (patch: Partial<MortgageBlock> = {}): MortgageBlock =>
  ({
    id: "m-buy",
    propertyId: "buy",
    startDate: EARLY,
    initialPrincipal: money(PRINCIPAL),
    fixationYears: 5, // reset in 2031: no reset in years 1–2
    interestRatePa: rate("0.05"),
    monthlyInstalment: money(INSTALMENT),
    ...patch,
  }) as MortgageBlock;

/** The seed plus one future buy with its own blocks. */
function withBuy(
  blocks: MortgageBlock[] = [loan()],
  purchaseDate = PURCHASE,
  patch: Partial<Property> = {},
): Portfolio {
  const buy: Property = {
    id: "buy",
    name: "Byt Slovanske",
    purchaseDate,
    purchasePrice: money(PRICE),
    ...patch,
  };
  return {
    properties: [...portfolio.properties, buy],
    mortgages: [...portfolio.mortgages, ...blocks],
    valuations: [
      ...portfolio.valuations,
      {
        id: "v-buy",
        propertyId: "buy",
        validFrom: purchaseDate,
        marketValue: money(PRICE),
      },
    ],
    leases: [
      ...portfolio.leases,
      {
        id: "l-buy",
        propertyId: "buy",
        startDate: purchaseDate,
        monthlyRent: money("20000"),
      },
    ],
    holdingCosts: portfolio.holdingCosts,
  };
}

/** The cash outside net cash flow: with no refinance and no prepayment on the seed,
 *  only the buy's down payment and its pre-purchase payments. */
function outflow(p: Portfolio, a: Assumptions = assumptions): Decimal {
  const sum = portfolioProjection(p, a)
    .slice(1)
    .reduce((s, y) => s.plus(y.netCashFlow), ZERO);
  return sum.minus(portfolioKpis(p, a).cumulativeNetCashFlow);
}

/** The buy's raw schedule rows of grid months `from..to`, summed. */
function buyRows(p: Portfolio, from: number, to: number) {
  const rows =
    propertySchedules(p.mortgages, ["buy"], assumptions).get("buy")?.rows ?? [];
  const sum = (pick: (r: (typeof rows)[number]) => Decimal) =>
    rows
      .filter((r) => r.month >= from && r.month <= to)
      .reduce((s, r) => s.plus(pick(r)), ZERO);
  return {
    interest: sum((r) => r.interest),
    principal: sum((r) => r.principal),
    prepaid: sum((r) => r.prepaid),
    fees: sum((r) => r.prepaymentFee),
    drawn: sum((r) => r.drawn),
  };
}

const sumProj = (
  p: Portfolio,
  pick: (y: {
    interest: Decimal;
    principal: Decimal;
    prepaid: Decimal;
  }) => Decimal,
) =>
  portfolioProjection(p, assumptions)
    .slice(1)
    .reduce((s, y) => s.plus(pick(y)), ZERO);

describe("ADR 0124: debt service before a future purchase is owner cash", () => {
  it("counts the 24 instalments of years 1–2 beside the down payment", () => {
    // 2 × 12 × 25,000 before the turn-on year, then price − loan in year 3.
    expectKc(outflow(withBuy()), DOWN_PAYMENT + 24 * INSTALMENT, "early loan");
  });

  it("a loan starting on the purchase date has no pre-purchase cash", () => {
    expectKc(
      outflow(withBuy([loan({ startDate: PURCHASE })])),
      DOWN_PAYMENT,
      "loan at purchase",
    );
  });

  it("the projection rows before the purchase stay empty", () => {
    const proj = portfolioProjection(withBuy(), assumptions);
    const seed = portfolioProjection(portfolio, assumptions);
    for (const t of [1, 2]) {
      expect(proj[t].interest.toString(), `y${t}`).toBe(
        seed[t].interest.toString(),
      );
      expect(proj[t].netCashFlow.toString(), `y${t}`).toBe(
        seed[t].netCashFlow.toString(),
      );
    }
  });

  it("levered IRR, nominal and real, pays the pre-purchase cash in its years", () => {
    const p = withBuy();
    const proj = portfolioProjection(p, assumptions);
    const cpi = cpiIndex(assumptions);
    const pre = [1, 2].map((t) => buyRows(p, 12 * t - 11, 12 * t));
    const cash = (t: number): Decimal =>
      t === 1 || t === 2
        ? pre[t - 1].interest.plus(pre[t - 1].principal)
        : t === 3
          ? money(DOWN_PAYMENT)
          : ZERO;
    const nominal: Decimal[] = [proj[0].equity.negated()];
    for (let t = 1; t <= N; t++) {
      let cf = proj[t].netCashFlow.minus(cash(t));
      if (t === N) cf = cf.plus(proj[N].equity);
      nominal.push(cf);
    }
    const k = portfolioKpis(p, assumptions);
    expect(k.leveredIrrNominal?.toString()).toBe(irr(nominal)?.toString());
    expect(k.leveredIrrReal?.toString()).toBe(
      irr(nominal.map((cf, t) => cf.div(cpi[t])))?.toString(),
    );
    const real = nominal
      .slice(1)
      .map((cf, i) => (i + 1 === N ? cf.minus(proj[N].equity) : cf))
      .reduce((s, cf, i) => s.plus(cf.div(cpi[i + 1])), ZERO);
    expectKc(k.cumulativeNetCashFlowReal, real.toNumber(), "real cumulative");
  });

  it("total interest adds the pre-purchase interest, nominal and real", () => {
    const p = withBuy();
    const cpi = cpiIndex(assumptions);
    const pre = [1, 2].map((t) => buyRows(p, 12 * t - 11, 12 * t));
    const proj = portfolioProjection(p, assumptions);
    let real = ZERO;
    for (let t = 1; t <= N; t++) {
      const extra = t <= 2 ? pre[t - 1].interest : ZERO;
      real = real.plus(proj[t].interest.plus(extra).div(cpi[t]));
    }
    const k = portfolioKpis(p, assumptions);
    const projInterest = sumProj(p, (y) => y.interest);
    expectKc(
      k.totalInterest,
      projInterest.plus(pre[0].interest).plus(pre[1].interest).toNumber(),
      "nominal",
    );
    expectKc(k.totalInterestReal, real.toNumber(), "real");
  });

  it("total interest and Σ principal repaid add the same 600,000 Kč of payments", () => {
    // Before ADR 0124 Σ principal repaid already walked the raw schedule (pre-purchase
    // principal in), while total interest read the rows (pre-purchase interest out).
    const p = withBuy();
    const k = portfolioKpis(p, assumptions);
    const interestGap = k.totalInterest.minus(sumProj(p, (y) => y.interest));
    const principalGap = k.totalPrincipalRepaid.minus(
      sumProj(p, (y) => y.principal.plus(y.prepaid)),
    );
    const pre = buyRows(p, 1, 24);
    expectKc(interestGap, pre.interest.toNumber(), "interest gap");
    expectKc(
      principalGap,
      pre.principal.plus(pre.prepaid).toNumber(),
      "principal gap",
    );
    expectKc(interestGap.plus(principalGap), 24 * INSTALMENT, "24 instalments");
  });

  it("a prepayment and its fee before the purchase are owner cash too", () => {
    // Paid with the 2027-03-10 instalment (year 1). Shorten term keeps the instalment.
    const prepaid = loan({
      prepayments: [
        {
          date: isoDate("2027-03-01"),
          amount: money(500_000),
          effect: "shortenTerm",
          fee: money(5_000),
        },
      ],
    });
    const p = withBuy([prepaid]);
    const y1 = buyRows(p, 1, 12);
    expectKc(y1.prepaid, 500_000, "prepaid in year 1");
    expectKc(
      outflow(p),
      DOWN_PAYMENT + 24 * INSTALMENT + 500_000 + 5_000,
      "prepayment + fee",
    );
  });

  it("a development tranche drawn before the purchase is bank money, not cash", () => {
    // 2 M at contract, 2 M on 2026-11-10, interest only until the handover.
    const dev = loan({
      monthlyInstalment: money("10000"),
      initialPrincipal: money(2_000_000),
      loanTermYears: 30,
      draws: [{ date: isoDate("2026-11-10"), amount: money(2_000_000) }],
      completionDate: PURCHASE,
    });
    const p = withBuy([dev]);
    const y1 = buyRows(p, 1, 12);
    const y2 = buyRows(p, 13, 24);
    expectKc(y1.drawn, 2_000_000, "tranche drawn in year 1");
    expectKc(y1.principal.plus(y2.principal), 0, "interest only");
    expectKc(y2.interest, 200_000, "year 2: 4 M × 5 %");
    // Year 1: 5 payments on 2 M, then 7 on 4 M, at 5 % / 12.
    expectKc(y1.interest, 41_666.67 + 116_666.67, "year 1 interest");
    expectKc(
      outflow(p),
      DOWN_PAYMENT + 158_333.33 + 200_000,
      "interest only, no tranche",
    );
  });

  it("a purchase after the horizon still pays its instalments in the window", () => {
    // tStart = N + 1: no down payment, no equity, 120 instalments before a 2041 reset.
    const p = withBuy([loan({ fixationYears: 15 })], isoDate("2037-01-15"));
    expectKc(outflow(p), 120 * INSTALMENT, "after the horizon");
  });

  it("an inactive future buy pays nothing", () => {
    expectKc(
      outflow(withBuy([loan()], PURCHASE, { active: false })),
      0,
      "inactive",
    );
  });
});

/**
 * Conservation, an oracle independent of how the years are split: for a portfolio of
 * only the buy, with every loan drawn after baseDate and inside the horizon,
 *   cumulative CF + equity_N − Σ NOI + total interest + Σ fees = value_N − price.
 * Every koruna of principal the owner repays comes back as equity; net refinance cash
 * comes back as debt. Before ADR 0124 the pre-purchase principal, prepaid and fees broke
 * it.
 */
describe("ADR 0124: owner cash is conserved around the turn-on year", () => {
  const AFTER_BASE = isoDate("2027-01-10");

  function buyOnly(
    blocks: MortgageBlock[],
    purchaseDate = PURCHASE,
  ): Portfolio {
    const p = withBuy(blocks, purchaseDate);
    const own = (x: { propertyId: string }) => x.propertyId === "buy";
    return {
      properties: p.properties.filter((x) => x.id === "buy"),
      mortgages: p.mortgages.filter(own),
      valuations: p.valuations.filter(own),
      leases: p.leases.filter(own),
      holdingCosts: [],
    };
  }

  function expectConserved(p: Portfolio, label: string) {
    const proj = portfolioProjection(p, assumptions);
    const k = portfolioKpis(p, assumptions);
    const rows =
      propertySchedules(p.mortgages, ["buy"], assumptions).get("buy")?.rows ??
      [];
    const fees = rows
      .filter((r) => r.month <= 12 * N)
      .reduce((s, r) => s.plus(r.prepaymentFee), ZERO);
    const noi = proj.slice(1).reduce((s, y) => s.plus(y.noi), ZERO);
    const lhs = k.cumulativeNetCashFlow
      .plus(proj[N].equity)
      .minus(noi)
      .plus(k.totalInterest)
      .plus(fees);
    expectKc(lhs, proj[N].value.minus(PRICE).toNumber(), label);
  }

  it("a loan drawn after baseDate, with a prepayment and fee before the purchase", () => {
    const l = loan({
      startDate: AFTER_BASE,
      prepayments: [
        {
          date: isoDate("2027-09-01"),
          amount: money(500_000),
          effect: "shortenTerm",
          fee: money(5_000),
        },
      ],
    });
    expectConserved(buyOnly([l]), "prepayment before the purchase");
  });

  it("a cash-out refinance before the purchase", () => {
    const refi = loan({
      id: "m-refi",
      startDate: isoDate("2028-06-10"),
      initialPrincipal: money(4_500_000),
      monthlyInstalment: money(28_000),
    });
    expectConserved(
      buyOnly([loan({ startDate: AFTER_BASE }), refi]),
      "refinance before the purchase",
    );
  });

  it("a purchase on a grid point and one day after it", () => {
    const l = loan({ startDate: AFTER_BASE });
    expectConserved(buyOnly([l], isoDate("2029-01-07")), "on grid point 31");
    expectConserved(buyOnly([l], isoDate("2029-01-08")), "one day after");
  });

  it("development tranches before and after the purchase", () => {
    // Interest only before the purchase: no principal to conserve, so this case held
    // before ADR 0124 too (the interest tests above pin the pre-purchase interest).
    const dev = loan({
      startDate: AFTER_BASE,
      initialPrincipal: money(2_000_000),
      loanTermYears: 30,
      draws: [
        { date: isoDate("2028-05-10"), amount: money(1_000_000) },
        { date: isoDate("2029-06-10"), amount: money(1_000_000) },
      ],
      completionDate: isoDate("2029-06-10"),
    });
    expectConserved(buyOnly([dev]), "dev tranches");
  });
});
