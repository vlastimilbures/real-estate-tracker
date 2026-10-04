// ADR 0119 (#33, #103, #140): the down payment of a property bought after baseDate is
// the recorded own cash, else purchase price − acquisition loan + costs + works. The
// acquisition loan is the earliest block starting no later than 90 days after the
// purchase, with every tranche. Hand-calculated figures; the seed has no future buy, so
// a funding record on an owned property moves nothing.
import { describe, it, expect } from "vitest";
import { acquisitionSummary } from "../acquisition";
import { portfolioKpis } from "../kpis";
import { portfolioProjection } from "../projections";
import { addDays, isoDate } from "../dates";
import { money, rate } from "../brands";
import { ZERO } from "../../lib/money";
import type {
  AcquisitionFunding,
  Assumptions,
  MortgageBlock,
  Portfolio,
  Property,
} from "../types";
import { assumptions, portfolio, PARITY } from "./support/seed";
import { expectKc, expectRatio } from "./support/tolerance";

const PURCHASE = isoDate("2029-01-01"); // baseDate 2026-06-07 → tStart 3
const PRICE = 5_800_000;
const VALUE = 6_200_000; // above the price: the price is what is paid (ADR 0119 §5)

const loan = (
  patch: Partial<
    Pick<MortgageBlock, "id" | "startDate" | "initialPrincipal">
  > = {},
): MortgageBlock => ({
  id: "m-buy",
  propertyId: "buy",
  startDate: PURCHASE,
  initialPrincipal: money(2_000_000),
  fixationYears: 5,
  interestRatePa: rate("0.04"),
  monthlyInstalment: money("30000"),
  ...patch,
});

/** The seed plus one future buy with its own blocks and funding record. */
function withBuy(
  blocks: MortgageBlock[] = [loan()],
  funding?: AcquisitionFunding,
  price = PRICE,
  value = VALUE,
): Portfolio {
  const buy: Property = {
    id: "buy",
    name: "Byt Slovanske",
    purchaseDate: PURCHASE,
    purchasePrice: money(price),
    ...(funding ? { funding } : {}),
  };
  return {
    properties: [...portfolio.properties, buy],
    mortgages: [...portfolio.mortgages, ...blocks],
    valuations: [
      ...portfolio.valuations,
      {
        id: "v-buy",
        propertyId: "buy",
        validFrom: PURCHASE,
        marketValue: money(value),
      },
    ],
    leases: [
      ...portfolio.leases,
      {
        id: "l-buy",
        propertyId: "buy",
        startDate: PURCHASE,
        monthlyRent: money("20000"),
      },
    ],
    holdingCosts: portfolio.holdingCosts,
  };
}

const withCost = (pct: string): Assumptions => ({
  ...assumptions,
  acquisitionCostPct: rate(pct),
});

/** The cash outside net cash flow: with no refinance and no prepayment, only the buy. */
function outflow(p: Portfolio, a: Assumptions = assumptions) {
  const sum = portfolioProjection(p, a)
    .slice(1)
    .reduce((s, y) => s.plus(y.netCashFlow), ZERO);
  return sum.minus(portfolioKpis(p, a).cumulativeNetCashFlow);
}

const summary = (p: Portfolio, a: Assumptions = assumptions) =>
  acquisitionSummary(
    p.properties.find((x) => x.id === "buy")!,
    p,
    a,
  );

describe("ADR 0119 §5: the down payment of a future buy", () => {
  it("without a record: purchase price − acquisition loan (not the valuation)", () => {
    expectKc(outflow(withBuy()), PRICE - 2_000_000, "3.8 M");
  });

  it("the cost rate is a fraction of the price: + 0.06 × 5.8 M", () => {
    expectKc(outflow(withBuy(), withCost("0.06")), 4_148_000, "with pct");
  });

  it("entered transaction costs win over the cost rate", () => {
    const p = withBuy([loan()], { transactionCosts: money(150_000) });
    expectKc(outflow(p, withCost("0.06")), 3_950_000, "entered costs");
  });

  it("entered initial works are added", () => {
    expectKc(
      outflow(withBuy([loan()], { initialWorks: money(300_000) })),
      4_100_000,
      "works",
    );
    expectKc(
      outflow(
        withBuy([loan()], {
          transactionCosts: money(150_000),
          initialWorks: money(300_000),
        }),
      ),
      4_250_000,
      "costs + works",
    );
  });

  it("recorded own cash is the outflow, whatever costs, works and rate say", () => {
    const p = withBuy([loan()], {
      ownCash: money(1_500_000),
      transactionCosts: money(150_000),
      initialWorks: money(300_000),
    });
    expectKc(outflow(p, withCost("0.06")), 1_500_000, "own cash");
  });

  it("own cash 0 is a fact (fully financed), not unknown", () => {
    const p = withBuy([loan()], { ownCash: money(0) });
    expectKc(outflow(p, withCost("0.06")), 0, "own cash 0");
  });

  it("#103: a development loan's tranches are the bank's money, not the owner's", () => {
    const dev: MortgageBlock = {
      ...loan(),
      interestRatePa: rate("0.05"),
      monthlyInstalment: money("10000"),
      loanTermYears: 30,
      draws: [
        { date: isoDate("2029-09-01"), amount: money(3_000_000) },
        { date: isoDate("2030-06-01"), amount: money(3_000_000) },
      ],
      completionDate: isoDate("2030-06-01"),
    };
    const p = withBuy([dev], undefined, 10_000_000, 10_000_000);
    expectKc(outflow(p), 2_000_000, "10 M − 8 M");
  });
});

describe("ADR 0119 §3: the acquisition loan", () => {
  it("counts the earliest block starting up to 90 days after the purchase", () => {
    const at90 = withBuy([loan({ startDate: addDays(PURCHASE, 90) })]);
    expectKc(outflow(at90), 3_800_000, "+90 d");
    expect(summary(at90).loan?.toString()).toBe("2000000");
  });

  it("does not count a first loan starting 91 days after the purchase", () => {
    const at91 = withBuy([loan({ startDate: addDays(PURCHASE, 91) })]);
    expect(summary(at91).loan).toBeNull();
    expectKc(outflow(at91), PRICE, "cash purchase");
  });

  it("counts a loan drawn before the purchase (off-plan, before handover)", () => {
    const early = withBuy([loan({ startDate: isoDate("2028-01-01") })]);
    expect(summary(early).loan?.toString()).toBe("2000000");
    expectKc(outflow(early), 3_800_000, "early loan");
  });

  it("never counts a later (refinance) block", () => {
    const refi = loan({
      id: "m-refi",
      startDate: isoDate("2031-01-01"),
      initialPrincipal: money(3_000_000),
    });
    expect(summary(withBuy([refi, loan()])).loan?.toString()).toBe("2000000");
  });
});

describe("ADR 0119 §4: sources and uses", () => {
  it("uses, sources and the gap, by hand", () => {
    const s = summary(
      withBuy([loan()], {
        ownCash: money(4_000_000),
        transactionCosts: money(150_000),
        initialWorks: money(300_000),
      }),
    );
    expect(s.uses.toString()).toBe("6250000"); // 5.8 M + 150 k + 300 k
    expect(s.sources?.toString()).toBe("6000000"); // 4 M + 2 M loan
    expect(s.gap?.toString()).toBe("250000"); // uses not covered
    expect(s.outflow.toString()).toBe("4000000");
  });

  it("has no sources or gap while own cash is unknown", () => {
    const s = summary(withBuy([loan()], { transactionCosts: money(150_000) }));
    expect(s.ownCash).toBeNull();
    expect(s.sources).toBeNull();
    expect(s.gap).toBeNull();
    expect(s.uses.toString()).toBe("5950000");
  });

  it("counts no loan as 0 in the sources; a surplus is a negative gap", () => {
    const s = summary(withBuy([], { ownCash: money(6_000_000) }));
    expect(s.loan).toBeNull();
    expect(s.sources?.toString()).toBe("6000000");
    expect(s.gap?.toString()).toBe("-200000");
  });
});

describe("ADR 0119 §2/§5: consistency", () => {
  it("own cash equal to the derived amount leaves every KPI unchanged", () => {
    const derived = portfolioKpis(withBuy(), withCost("0.06"));
    const recorded = portfolioKpis(
      withBuy([loan()], { ownCash: money(4_148_000) }),
      withCost("0.06"),
    );
    expect(recorded.cumulativeNetCashFlow.toString()).toBe(
      derived.cumulativeNetCashFlow.toString(),
    );
    expect(recorded.leveredIrrNominal?.toString()).toBe(
      derived.leveredIrrNominal?.toString(),
    );
    expect(recorded.leveredIrrReal?.toString()).toBe(
      derived.leveredIrrReal?.toString(),
    );
  });

  it("a record on a property bought before baseDate moves no figure", () => {
    const funded: Portfolio = {
      ...portfolio,
      properties: portfolio.properties.map((p, i) =>
        i === 0
          ? {
              ...p,
              funding: {
                ownCash: money(2_167_500),
                transactionCosts: money(80_000),
              },
            }
          : p,
      ),
    };
    const k = portfolioKpis(funded, assumptions);
    expectKc(
      k.cumulativeNetCashFlow,
      PARITY.kpis.cumulativeNetCashFlow,
      "cumulative CF",
    );
    expectRatio(k.leveredIrrNominal!, PARITY.kpis.leveredIrrNominal, "IRR");
    expect(k).toEqual(portfolioKpis(portfolio, assumptions));
  });
});

describe("addDays", () => {
  it.each([
    ["2029-01-01", 90, "2029-04-01"],
    ["2028-02-28", 1, "2028-02-29"],
    ["2027-02-28", 1, "2027-03-01"],
    ["2026-12-31", 1, "2027-01-01"],
    ["2026-03-01", -1, "2026-02-28"],
  ] as const)("%s + %i = %s", (from, days, to) => {
    expect(addDays(isoDate(from), days).toISOString().slice(0, 10)).toBe(to);
  });
});
