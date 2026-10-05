// Regression for the future-purchase bug: a property bought after baseDate must
// not appear in the projection before its purchase year, must re-anchor its basis
// to the purchase date, and must be excluded from the current snapshot totals.
import { describe, it, expect } from "vitest";
import { propertyProjection } from "../projections";
import { portfolioSnapshot, propertySnapshot } from "../metrics";
import { schedulesByProperty } from "../schedule";
import { isoDate } from "../dates";
import { D } from "../../lib/money";
import { assumptions, portfolio } from "./support/seed";
import type { Lease, Portfolio, Property } from "../types";
import { rate } from "../brands";
import { money } from "../brands";

const PURCHASE = isoDate("2029-01-01"); // baseDate is 2026-06-07 → tStart = 3
const PURCHASE_YEAR = 2029;
const FUTURE_VALUE = 6_200_000;
const MONTHLY_RENT = 20_000;
const PRINCIPAL = 2_000_000;

const slovanske: Property = {
  id: "slovanske",
  name: "Byt Slovanske",
  type: "1 bedroom",
  sizeM2: 55,
  purchaseDate: PURCHASE,
  purchasePrice: money("5800000"),
};

// Fixture portfolio + one future property (purchase, valuation, lease, mortgage
// all dated on/after the future purchase date).
const withFuture: Portfolio = {
  properties: [...portfolio.properties, slovanske],
  mortgages: [
    ...portfolio.mortgages,
    {
      id: "m-slovanske",
      propertyId: "slovanske",
      startDate: PURCHASE,
      initialPrincipal: money(PRINCIPAL),
      fixationYears: 5,
      interestRatePa: rate("0.04"),
      monthlyInstalment: money("30000"), // high enough to fully amortize in-window
    },
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
      monthlyRent: money(MONTHLY_RENT),
    },
  ],
  holdingCosts: portfolio.holdingCosts, // falls back to assumption defaults
};

const schedules = schedulesByProperty(
  withFuture.mortgages,
  withFuture.properties.map((p) => p.id),
  assumptions,
);
const proj = propertyProjection(
  slovanske,
  withFuture,
  assumptions,
  schedules.get("slovanske") ?? [],
);

describe("future property — projection gating", () => {
  it("is empty in every year before the purchase year", () => {
    const before = proj.filter((y) => y.calendarYear < PURCHASE_YEAR);
    expect(before.length).toBeGreaterThan(0);
    for (const y of before) {
      expect(y.value.isZero(), `value @ ${y.calendarYear}`).toBe(true);
      expect(y.balance.isZero(), `balance @ ${y.calendarYear}`).toBe(true);
      expect(y.grossRent.isZero(), `grossRent @ ${y.calendarYear}`).toBe(true);
      expect(y.noi.isZero(), `noi @ ${y.calendarYear}`).toBe(true);
      expect(y.debtService.isZero(), `debtService @ ${y.calendarYear}`).toBe(
        true,
      );
      expect(y.netCashFlow.isZero(), `netCashFlow @ ${y.calendarYear}`).toBe(
        true,
      );
    }
  });

  it("appears in the purchase year at its purchase-date basis", () => {
    const y = proj.find((r) => r.calendarYear === PURCHASE_YEAR)!;
    // value = valuation in force at the purchase date (basis re-anchored), grown by the
    // whole months from the purchase to the year's date 2029-06-07 (5 / 12), as the
    // snapshot does (D-32; was not grown, exponent 0).
    expect(y.value.toNumber()).toBeCloseTo(FUTURE_VALUE * 1.04 ** (5 / 12), 2);
    // Purchase 2029-01-01 falls in grid month 31 → projection year 3 (months 25–36),
    // so the lease is live for 6 of that bucket's months (pro-rated turn-on year),
    // not a full 12 (no zero-rent leak, no full-year overcount either).
    expect(y.grossRent.toNumber()).toBeCloseTo(MONTHLY_RENT * 6, 2);
  });
});

describe("future property — amortization draw", () => {
  const sched = schedules.get("slovanske")!;

  it("is undrawn (zero rows) before the mortgage start date", () => {
    const pre = sched.filter((r) => r.date.getTime() < PURCHASE.getTime());
    expect(pre.length).toBeGreaterThan(0);
    for (const r of pre) {
      expect(r.interest.isZero()).toBe(true);
      expect(r.principal.isZero()).toBe(true);
      expect(r.endBalance.isZero()).toBe(true);
    }
  });

  it("draws the full principal on the first month on/after startDate", () => {
    const draw = sched.find((r) => r.date.getTime() >= PURCHASE.getTime())!;
    expect(draw.endBalance.toNumber()).toBeCloseTo(PRINCIPAL, 2);
  });

  it("Σ principal repaid equals the initial principal (fully amortized in-window)", () => {
    const last = sched[sched.length - 1];
    expect(last.endBalance.toNumber()).toBeCloseTo(0, 2); // confirms full payoff
    const sumPrincipal = sched.reduce((a, r) => a.plus(r.principal), D(0));
    expect(sumPrincipal.toNumber()).toBeCloseTo(PRINCIPAL, 0);
  });
});

describe("future property — mid-year purchase (turn-on alignment)", () => {
  // Mirrors the user's real case: a mid-year purchase, a year+ after baseDate.
  // The turn-on year is the month-grid slice that contains the purchase (the same
  // slice the loan draws in), so value, rent AND debt switch on together — no
  // phantom debt-free first year. With baseDate 2026-06-07 the 2027-09-01 purchase
  // falls in projection year 2 (the slice spanning 2027-07 → 2028-06).
  const MID = isoDate("2027-09-01");
  const TURN_ON_YEAR = 2028; // baseYear(2026) + 2
  const MID_VALUE = 5_000_000;
  const MID_RENT = 18_000;
  const midProp: Property = {
    id: "mid",
    name: "Byt Mid",
    purchaseDate: MID,
    purchasePrice: money("4080000"),
  };
  const midPortfolio: Portfolio = {
    properties: [...portfolio.properties, midProp],
    mortgages: [
      ...portfolio.mortgages,
      {
        id: "m-mid",
        propertyId: "mid",
        startDate: MID,
        initialPrincipal: money("3000000"),
        fixationYears: 5,
        interestRatePa: rate("0.04"),
        monthlyInstalment: money("16000"),
      },
    ],
    valuations: [
      ...portfolio.valuations,
      {
        id: "v-mid",
        propertyId: "mid",
        validFrom: MID,
        marketValue: money(MID_VALUE),
      },
    ],
    leases: [
      ...portfolio.leases,
      {
        id: "l-mid",
        propertyId: "mid",
        startDate: MID,
        monthlyRent: money(MID_RENT),
      },
    ],
    holdingCosts: portfolio.holdingCosts,
  };
  const midSched = schedulesByProperty(
    midPortfolio.mortgages,
    midPortfolio.properties.map((p) => p.id),
    assumptions,
  );
  const midProj = propertyProjection(
    midProp,
    midPortfolio,
    assumptions,
    midSched.get("mid") ?? [],
  );
  const turnOn = midProj.find((y) => y.calendarYear === TURN_ON_YEAR)!;

  it("is empty in every year before the turn-on year", () => {
    for (const y of midProj.filter((r) => r.calendarYear < TURN_ON_YEAR)) {
      expect(y.value.isZero(), `value @ ${y.calendarYear}`).toBe(true);
      expect(y.balance.isZero(), `balance @ ${y.calendarYear}`).toBe(true);
      expect(y.grossRent.isZero(), `grossRent @ ${y.calendarYear}`).toBe(true);
    }
  });

  it("turns value, rent AND debt on together in the turn-on year", () => {
    // Grown 9 whole months, 2027-09-01 → 2028-06-07 (D-32; was not grown).
    expect(turnOn.value.toNumber()).toBeCloseTo(
      MID_VALUE * 1.04 ** (9 / 12),
      2,
    );
    // Purchase 2027-09-01 falls in grid month 15 → projection year 2 (months 13–24),
    // so the unit is let for 10 of that bucket's months (pro-rated turn-on year).
    expect(turnOn.grossRent.toNumber()).toBeCloseTo(MID_RENT * 10, 2);
    // debt is present in the same year — no phantom debt-free / equity-spike year.
    expect(turnOn.balance.isPositive()).toBe(true);
    expect(turnOn.debtService.isPositive()).toBe(true);
  });
});

describe("future property — current snapshot exclusion", () => {
  it("marks the future property as not owned", () => {
    const snap = portfolioSnapshot(withFuture, assumptions);
    const s = snap.perProperty.find((p) => p.propertyId === "slovanske")!;
    expect(s.owned).toBe(false);
    const owned = snap.perProperty.find((p) => p.propertyId === "lipova")!;
    expect(owned.owned).toBe(true);
  });

  it("leaves current portfolio totals unchanged by the future property", () => {
    const base = portfolioSnapshot(portfolio, assumptions);
    const withF = portfolioSnapshot(withFuture, assumptions);
    expect(withF.totalValue.toNumber()).toBeCloseTo(
      base.totalValue.toNumber(),
      2,
    );
    expect(withF.totalDebt.toNumber()).toBeCloseTo(
      base.totalDebt.toNumber(),
      2,
    );
    expect(withF.noi.toNumber()).toBeCloseTo(base.noi.toNumber(), 2);
    // sanity: the unchanged fixture still hits the parity anchor
    expect(base.totalValue.toNumber()).toBe(28_730_000);
  });

  it("propertySnapshot is true for a past-dated property (no-op guard)", () => {
    const s = propertySnapshot(portfolio.properties[0], portfolio, assumptions);
    expect(s.owned).toBe(true);
  });
});

describe("future property — turn-on edges (DR-168)", () => {
  /** The projection of a loan-free property bought on `purchaseDate`. */
  const bought = (purchaseDate: string, leases: Lease[] = []) => {
    const p: Property = {
      id: "nova",
      name: "Byt Nova",
      purchaseDate: isoDate(purchaseDate),
      purchasePrice: money("5000000"),
    };
    const withP: Portfolio = {
      ...portfolio,
      properties: [...portfolio.properties, p],
      leases: [...portfolio.leases, ...leases],
    };
    return propertyProjection(p, withP, assumptions, []);
  };

  it("a lease already running at the purchase pays rent only from the purchase", () => {
    // baseDate 2026-06-07: the first grid date on/after 2027-03-15 is 2027-04-07,
    // grid month 10, so year 1 has 3 rented months (10–12), not 12.
    const proj = bought("2027-03-15", [
      {
        id: "l-nova",
        propertyId: "nova",
        startDate: isoDate("2026-01-01"),
        monthlyRent: money("20000"),
      },
    ]);
    expect(proj[1]?.grossRent.toFixed(2)).toBe("60000.00");
    expect(proj[2]?.grossRent.toFixed(2)).toBe(
      money("20000").times("1.03").times(12).toFixed(2),
    );
  });

  it("a purchase in the horizon's last grid month comes online in the last year", () => {
    // 2056-06-01 falls in grid month 360 (2056-05-07, 2056-06-07]: year 30, not 31.
    const proj = bought("2056-06-01");
    expect(proj[29]?.value.isZero()).toBe(true);
    expect(proj[30]?.value.greaterThan(0)).toBe(true);
  });
});
