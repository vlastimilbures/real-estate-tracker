// ADR 0119 (#33, #103, #140): the down payment of a property bought after baseDate is
// the recorded own cash, else purchase price − acquisition loan + costs + works. The
// acquisition loan is the earliest block, with every tranche, when it starts no later
// than 90 days after the purchase or is a development loan (ADR 0168). Hand-calculated figures; the seed has no future buy, so
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

/** 2 M at purchase, then 3 M + 3 M tranches (#103 probe shape). */
const devLoan: MortgageBlock = {
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
  // Without a record (3,800,000) and with the cost rate alone (4,148,000):
  // levered-irr-acquisition.test.ts pins both on the same fixture.
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
    const p = withBuy([devLoan], undefined, 10_000_000, 10_000_000);
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
    expect(summary(at91).outflow.toString()).toBe(String(PRICE)); // its cash in: §5 below
  });

  it("counts a loan drawn before the purchase (off-plan, before handover)", () => {
    const early = withBuy([loan({ startDate: isoDate("2028-01-01") })]);
    expect(summary(early).loan?.toString()).toBe("2000000");
    expect(summary(early).outflow.toString()).toBe("3800000");
    // ADR 0124: drawn in grid month 19 (year 2), the instalments of months 20–24 are
    // paid before the turn-on year (3), so they are owner cash beside the down payment.
    expectKc(outflow(early), 3_800_000 + 5 * 30_000, "early loan");
  });

  it("never counts a later (refinance) block", () => {
    const refi = loan({
      id: "m-refi",
      startDate: isoDate("2031-01-01"),
      initialPrincipal: money(3_000_000),
    });
    expect(summary(withBuy([refi, loan()])).loan?.toString()).toBe("2000000");
  });

  it("counts only the tranches dated on or before the block that replaces it (D-47)", () => {
    // Refinanced before the last tranche: the schedule never draws it.
    const refi = (start: string) =>
      loan({
        id: "m-refi",
        startDate: isoDate(start),
        initialPrincipal: money(5_000_000),
      });
    const before = summary(
      withBuy([devLoan, refi("2030-01-01")], undefined, 10_000_000, 10_000_000),
    );
    expect(before.loan?.toString()).toBe("5000000"); // 2 M + the 2029-09 tranche
    expect(before.outflow.toString()).toBe("5000000");
    const onTheDay = summary(
      withBuy([devLoan, refi("2030-06-01")], undefined, 10_000_000, 10_000_000),
    );
    expect(onTheDay.loan?.toString()).toBe("8000000"); // on the day: still drawn
  });

  it("takes the earliest block, not the latest one inside the window", () => {
    // An off-plan loan a year before handover, then a successor 14 days after it.
    const offPlan = loan({ id: "m-offplan", startDate: isoDate("2028-01-01") });
    const handover = loan({
      id: "m-handover",
      startDate: isoDate("2029-01-15"),
      initialPrincipal: money(3_500_000),
    });
    expect(summary(withBuy([handover, offPlan])).loan?.toString()).toBe(
      "2000000",
    );
  });
});

describe("ADR 0119 §5: a first loan after the window", () => {
  const kpiText = (p: Portfolio, a: Assumptions = assumptions) => {
    const k = portfolioKpis(p, a);
    return [k.cumulativeNetCashFlow, k.leveredIrrNominal, k.leveredIrrReal].map(
      (x) => x?.toString(),
    );
  };

  it("drawn in the purchase's projection year: the same figures as inside the window", () => {
    // +90 d nets the loan off the down payment; +91 d charges the price and books the
    // loan as cash in, both in year 3, so one day moves nothing.
    expect(
      kpiText(withBuy([loan({ startDate: addDays(PURCHASE, 91) })])),
    ).toEqual(kpiText(withBuy([loan({ startDate: addDays(PURCHASE, 90) })])));
  });

  it("drawn a year later: the price goes out, the principal comes back", () => {
    const later = loan({ startDate: isoDate("2030-03-01") }); // projection year 4
    expectKc(outflow(withBuy([later])), 3_800_000, "5.8 M out, 2 M in");
    // A cash purchase recorded as such: same cash, the loan still comes back.
    expectKc(
      outflow(withBuy([later], { ownCash: money(PRICE) })),
      3_800_000,
      "recorded cash buy",
    );
  });

  it("drawn in the horizon's last year: the principal still comes back", () => {
    const a = { ...assumptions, horizonYears: 5 };
    const lastYear = loan({ startDate: isoDate("2031-01-01") }); // projection year 5
    expectKc(outflow(withBuy([lastYear]), a), 3_800_000, "5.8 M out, 2 M in");
  });

  it("drawn after the horizon: no cash in", () => {
    const a = { ...assumptions, horizonYears: 5 };
    const beyond = loan({ startDate: isoDate("2032-01-01") }); // projection year 6
    expectKc(outflow(withBuy([beyond]), a), PRICE, "price only");
  });
});

describe("ADR 0168: a first development loan funds the purchase whatever its start", () => {
  // 212 days after the purchase, and after the turn-on year's grid date (2029-06-07).
  const lateDev: MortgageBlock = {
    ...devLoan,
    startDate: isoDate("2029-08-01"),
  };
  const LOAN = 8_000_000; // 2 M + 3 M + 3 M

  it("the Acquisition check counts the whole loan", () => {
    const s = summary(
      withBuy(
        [lateDev],
        { ownCash: money(2_000_000), transactionCosts: money(4_000) },
        10_000_000,
        10_000_000,
      ),
    );
    expect(s.loan?.toString()).toBe(String(LOAN));
    expect(s.sources?.toString()).toBe("10000000"); // 2 M own + 8 M loan
    expect(s.gap?.toString()).toBe("4000"); // only the costs
  });

  it("the down payment nets the loan, and no principal comes back", () => {
    const p = withBuy([lateDev], undefined, 10_000_000, 10_000_000);
    expectKc(outflow(p), 2_000_000, "10 M price − 8 M loan");
  });

  it("a plain loan after the window still pays its principal to the owner", () => {
    const p = withBuy([loan({ startDate: isoDate("2029-08-01") })]);
    expect(summary(p).loan).toBeNull();
    expectKc(outflow(p), 3_800_000, "5.8 M out, 2 M in");
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

describe("ADR 0119 §5: a property already owned", () => {
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
