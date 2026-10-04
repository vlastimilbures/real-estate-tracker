// P3 edge-case characterisation: each test pins TODAY's output so the P4a refactor cannot
// change it silently. Where today's output is known-wrong the comment carries the DR /
// decision ID; approved fixes arrive in P4b with new expectations. Cases already pinned
// elsewhere are not repeated: DR-014/016/018/070/100/102 in reference/edgeCases.test.ts,
// finding D in reference/characterisation.test.ts, future-buy pro-rating in
// future-rent-gating.test.ts, the down-payment outflow in levered-irr-acquisition.test.ts,
// deactivation in active-flag.test.ts, dev-loan interest-only/draws in
// amortization.dev.test.ts.
import { describe, it, expect } from "vitest";
import { D, ZERO } from "../../lib/money";
import { isoDate } from "../dates";
import {
  leaseInForce,
  valuationInForce,
  portfolioSnapshot,
  propertySnapshot,
} from "../metrics";
import { portfolioProjection, propertyProjection } from "../projections";
import { portfolioKpis, irr } from "../kpis";
import { schedulesByProperty } from "../schedule";
import { applyScenario, type ScenarioOverrides } from "../scenarios";
import type { Lease, Portfolio, Valuation } from "../types";
import { assumptions, portfolio, PARITY } from "./support/seed";
import { KC, RATIO, near } from "./support/tolerance";
import { rate } from "../brands";
import { EngineInputError } from "../errors";
import { money } from "../brands";

const schedules = schedulesByProperty(
  portfolio.mortgages,
  portfolio.properties.map((p) => p.id),
  assumptions,
);
const lipova = portfolio.properties.find((p) => p.id === "lipova")!;
const snapAt = (iso: string) =>
  propertySnapshot(
    lipova,
    portfolio,
    assumptions,
    isoDate(iso),
    schedules.get("lipova"),
  );

// ---------------------------------------------------------------------------
// Effective-dating boundaries
// ---------------------------------------------------------------------------

describe("Finding G — the one-day lease gap on 2026-08-31 // DR-045", () => {
  it("snapshot rent: 21,675 on 08-30, 0 on 08-31 (no fallback), 23,205 from 09-01", () => {
    near(snapAt("2026-08-30").grossAnnualRent, 21_675 * 12, KC, "08-30");
    near(snapAt("2026-08-31").grossAnnualRent, 0, KC, "08-31 gap"); // DR-045
    near(snapAt("2026-09-01").grossAnnualRent, 23_205 * 12, KC, "09-01");
  });
  it("projection steps to 23,205 on the grid (D-80): year 1 = 2 × 21,675 × 1.03 + 10 × 23,205", () => {
    const proj = propertyProjection(
      lipova,
      portfolio,
      assumptions,
      schedules.get("lipova")!,
    );
    near(proj[1].grossRent, 2 * 21_675 * 1.03 + 10 * 23_205, KC, "year 1 rent"); // DR-045 fixed
  });
});

describe("Effective-dating boundaries are inclusive on both ends", () => {
  const lease: Lease = {
    id: "l",
    propertyId: "p",
    startDate: isoDate("2027-03-01"),
    endDate: isoDate("2027-12-31"),
    monthlyRent: money(10_000),
  };
  const val: Valuation = {
    id: "v",
    propertyId: "p",
    validFrom: isoDate("2027-03-01"),
    validTo: isoDate("2027-12-31"),
    marketValue: money(5_000_000),
  };
  it("start == asOf is in force; the day before is not", () => {
    expect(leaseInForce([lease], isoDate("2027-03-01"))?.id).toBe("l");
    expect(leaseInForce([lease], isoDate("2027-02-28"))).toBeUndefined();
    expect(valuationInForce([val], isoDate("2027-03-01"))?.id).toBe("v");
    expect(valuationInForce([val], isoDate("2027-02-28"))).toBeUndefined();
  });
  it("end/validTo == asOf is in force; the day after is not", () => {
    expect(leaseInForce([lease], isoDate("2027-12-31"))?.id).toBe("l");
    expect(leaseInForce([lease], isoDate("2028-01-01"))).toBeUndefined();
    expect(valuationInForce([val], isoDate("2027-12-31"))?.id).toBe("v");
    expect(valuationInForce([val], isoDate("2028-01-01"))).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// As-of before baseDate (D-19 target: typed engine error)
// ---------------------------------------------------------------------------

describe("As-of before baseDate // DR-015 (D-19)", () => {
  const asOf = isoDate("2024-06-07");
  const ASOF_ERROR = {
    code: "ASOF_BEFORE_BASEDATE",
    entity: "assumptions",
    field: "asOf",
  };
  const errorsOf = (fn: () => unknown) => {
    try {
      fn();
    } catch (e) {
      expect(e).toBeInstanceOf(EngineInputError);
      return (e as EngineInputError).errors;
    }
    throw new Error("expected an EngineInputError");
  };
  it("rejects it on the schedule path", () => {
    expect(
      errorsOf(() =>
        portfolioSnapshot(portfolio, assumptions, asOf, schedules),
      ),
    ).toEqual([ASOF_ERROR]);
  });
  it("rejects it when the schedules are omitted", () => {
    expect(
      errorsOf(() => portfolioSnapshot(portfolio, assumptions, asOf)),
    ).toEqual([ASOF_ERROR]);
  });
  it("rejects it for a single property", () => {
    expect(
      errorsOf(() => propertySnapshot(lipova, portfolio, assumptions, asOf)),
    ).toEqual([ASOF_ERROR]);
  });
  it("rejects it for an empty portfolio too (ADR 0075, DR-131)", () => {
    const empty = {
      properties: [],
      mortgages: [],
      valuations: [],
      leases: [],
      holdingCosts: [],
    };
    expect(errorsOf(() => portfolioSnapshot(empty, assumptions, asOf))).toEqual(
      [ASOF_ERROR],
    );
  });
  it("control: an as-of date equal to baseDate still gives the parity snapshot", () => {
    const s = portfolioSnapshot(
      portfolio,
      assumptions,
      assumptions.baseDate,
      schedules,
    );
    near(s.totalDebt, PARITY.snapshot.totalDebt, KC, "debt");
    near(s.totalValue, PARITY.snapshot.totalValue, KC, "value");
  });
});

// ---------------------------------------------------------------------------
// New loan starting within the first grid month after baseDate
// ---------------------------------------------------------------------------

describe("Loan starting in (baseDate, baseDate + 1 month] on an owned property // D-33 (DR-106)", () => {
  const owned: Portfolio = {
    properties: [
      {
        id: "p",
        name: "P",
        purchaseDate: isoDate("2020-01-01"),
        purchasePrice: money(3_000_000),
      },
    ],
    mortgages: [
      {
        id: "m",
        propertyId: "p",
        startDate: isoDate("2026-06-20"), // after baseDate 2026-06-07
        initialPrincipal: money(1_200_000),
        fixationYears: 5,
        interestRatePa: rate("0.04"),
        monthlyInstalment: money(12_000),
      },
    ],
    valuations: [],
    leases: [],
    holdingCosts: [],
  };
  const devOwned: Portfolio = {
    ...owned,
    mortgages: [
      {
        ...owned.mortgages[0],
        loanTermYears: 20,
        completionDate: isoDate("2027-06-20"),
        draws: [{ date: isoDate("2026-12-20"), amount: money(300_000) }],
      },
    ],
  };
  const openingDebt = (p: Portfolio) =>
    portfolioSnapshot(
      p,
      assumptions,
      assumptions.baseDate,
      schedulesByProperty(p.mortgages, ["p"], assumptions),
    ).totalDebt;
  // General form: Σ principal = opening + new debt drawn after baseDate − horizon balance.
  const conserves = (p: Portfolio, newDebt: number) => {
    const proj = portfolioProjection(p, assumptions);
    const sumP = proj.slice(1).reduce((s, y) => s.plus(y.principal), ZERO);
    const expected = proj[0].balance
      .plus(newDebt)
      .minus(proj[assumptions.horizonYears].balance);
    near(sumP, expected.toNumber(), KC, "conservation");
  };

  it("year 0 and the baseDate snapshot carry no debt: the loan is drawn after baseDate // D-33", () => {
    near(portfolioProjection(owned, assumptions)[0].balance, 0, KC, "year 0");
    near(openingDebt(owned), 0, KC, "snapshot debt");
  });

  it("Σ principal = opening + new debt − horizon balance // D-33", () =>
    conserves(owned, 1_200_000));

  it("a development loan starting in grid month 1 also opens at 0 // D-33", () => {
    near(
      portfolioProjection(devOwned, assumptions)[0].balance,
      0,
      KC,
      "year 0",
    );
    near(openingDebt(devOwned), 0, KC, "snapshot debt");
    conserves(devOwned, 1_500_000);
  });

  it("a start one grid month later (2026-07-08) is correctly undrawn at year 0", () => {
    const later: Portfolio = {
      ...owned,
      mortgages: [{ ...owned.mortgages[0], startDate: isoDate("2026-07-08") }],
    };
    near(portfolioProjection(later, assumptions)[0].balance, 0, KC, "year 0");
  });
});

describe("Tranche dated after baseDate within grid month 1 // D-44 (DR-121)", () => {
  const withTranche = (
    draws: { date: string; amount: number }[],
  ): Portfolio => ({
    properties: [
      {
        id: "p",
        name: "P",
        purchaseDate: isoDate("2020-01-01"),
        purchasePrice: money(5_000_000),
      },
    ],
    mortgages: [
      {
        id: "m",
        propertyId: "p",
        startDate: isoDate("2025-02-28"),
        initialPrincipal: money(3_000_000),
        fixationYears: 5,
        interestRatePa: rate("0.04"),
        monthlyInstalment: money(15_000),
        loanTermYears: 20,
        draws: draws.map((d) => ({
          date: isoDate(d.date),
          amount: money(d.amount),
        })),
      },
    ],
    valuations: [],
    leases: [],
    holdingCosts: [],
  });
  // baseDate 2026-06-07; grid month 1 closes 2026-07-07.
  const later = withTranche([{ date: "2026-06-20", amount: 500_000 }]);
  // Baseline: the same development loan with the tranche years away (an empty
  // draws list would make it a plain loan with a different instalment).
  const none = withTranche([{ date: "2030-06-20", amount: 500_000 }]);
  const year0 = (p: Portfolio) =>
    portfolioProjection(p, assumptions)[0].balance;
  const snapDebt = (p: Portfolio) =>
    portfolioSnapshot(
      p,
      assumptions,
      assumptions.baseDate,
      schedulesByProperty(p.mortgages, ["p"], assumptions),
    ).totalDebt;

  it("is not opening debt: year 0 and the baseDate snapshot exclude it // D-44", () => {
    near(year0(later), year0(none).toNumber(), KC, "year 0");
    near(snapDebt(later), snapDebt(none).toNumber(), KC, "snapshot debt");
  });

  it("Σ principal = opening + tranche − horizon balance // D-44", () => {
    const proj = portfolioProjection(later, assumptions);
    const sumP = proj.slice(1).reduce((s, y) => s.plus(y.principal), ZERO);
    const expected = proj[0].balance
      .plus(500_000)
      .minus(proj[assumptions.horizonYears].balance);
    near(sumP, expected.toNumber(), KC, "conservation");
  });

  it("a tranche on baseDate itself stays opening debt (D-41)", () => {
    const onBase = withTranche([{ date: "2026-06-07", amount: 500_000 }]);
    near(year0(onBase), year0(none).plus(500_000).toNumber(), KC, "year 0");
  });
});

// ---------------------------------------------------------------------------
// Scenario shocks: timing windows (DR-094)
// ---------------------------------------------------------------------------

describe("Scenario shocks — windows and edges // DR-094", () => {
  const base = portfolioProjection(portfolio, assumptions);
  const run = (o: ScenarioOverrides) =>
    portfolioProjection(portfolio, applyScenario(assumptions, o));
  const kpis = (o: ScenarioOverrides) =>
    portfolioKpis(portfolio, applyScenario(assumptions, o));
  const N = assumptions.horizonYears;

  it("valueShock at the horizon year hits only year N", () => {
    const p = run({ valueShock: { pct: rate("0.2"), atYear: N } });
    near(p[N - 1].value, base[N - 1].value.toNumber(), KC, "year N−1");
    near(p[N].value, base[N].value.times(0.8).toNumber(), KC, "year N");
  });

  it("valueShock beyond the horizon is a silent no-op (accepted today)", () => {
    const p = run({ valueShock: { pct: rate("0.2"), atYear: N + 1 } });
    near(p[N].value, base[N].value.toNumber(), KC, "year N"); // DR-094
  });

  it("overlapping inflation and rate shocks compose (both effects land)", () => {
    const both = kpis({
      inflationShock: { deltaPa: rate("0.03"), durationYears: 3 },
      rateShock: { deltaPa: rate("0.02"), durationYears: 3 },
    });
    near(both.netWorthNominal, PARITY.kpis.netWorthNominal, KC, "nominal NW");
    near(both.netWorthReal, 40_741_222.87, KC, "real NW");
    near(both.cumulativeNetCashFlow, 13_987_681.8, KC, "cum CF"); // D-80 (was 13,612,311.18)
    near(
      both.totalPrincipalRepaid,
      PARITY.snapshot.totalDebt,
      KC,
      "Σ principal",
    );
  });

  it("negative deltas are accepted and move the numbers the other way", () => {
    near(
      kpis({ inflationShock: { deltaPa: rate("-0.02"), durationYears: 5 } })
        .netWorthReal,
      49_024_013.29,
      KC,
      "deflation raises real NW",
    ); // DR-094: no validation of sign
    near(
      kpis({ rateShock: { deltaPa: rate("-0.01"), durationYears: 5 } })
        .cumulativeNetCashFlow,
      15_128_179.62, // D-80 (was 14,752,809.00)
      KC,
      "cheaper refix raises cum CF",
    );
  });

  it("a shock longer than the horizon equals one lasting exactly the horizon", () => {
    const long = kpis({
      inflationShock: { deltaPa: rate("0.01"), durationYears: 40 },
    });
    const exact = kpis({
      inflationShock: { deltaPa: rate("0.01"), durationYears: N },
    });
    expect(long).toEqual(exact); // DR-094: no clamp/warning, just saturates
    near(long.netWorthReal, 33_199_023.61, KC, "real NW");
  });

  it("a zero-duration shock is a no-op", () => {
    expect(
      kpis({ rateShock: { deltaPa: rate("0.01"), durationYears: 0 } }),
    ).toEqual(portfolioKpis(portfolio, assumptions));
  });
});

// ---------------------------------------------------------------------------
// KPI edge cases
// ---------------------------------------------------------------------------

describe("IRR edge cases // DR-061", () => {
  it("IRR = 0 when the cash flows just return the outlay", () => {
    near(irr([D(-100), D(50), D(50)])!, 0, RATIO, "irr 0");
  });
  it("root above the [−90 %, 100 %] bracket is found by widening (+900 %) // DR-158", () => {
    near(irr([D(-1), D(10)])!, 9, RATIO, "irr 900 %");
  });
  it("two roots (10 % and 20 %) ⇒ null, not unique // DR-158", () => {
    expect(irr([D(-100), D(230), D(-132)])).toBeNull();
  });
  it("an all-zero vector ⇒ null", () => {
    expect(irr([ZERO, ZERO, ZERO])).toBeNull();
  });
});

describe("CAGR and DSCR edge cases", () => {
  const property = {
    id: "p",
    name: "P",
    purchaseDate: isoDate("2020-01-01"),
    purchasePrice: money(3_000_000),
  };
  const withLoan = (
    principal: number,
    purchaseDate = property.purchaseDate,
  ) => ({
    properties: [{ ...property, purchaseDate }],
    mortgages: [
      {
        id: "m",
        propertyId: "p",
        startDate: purchaseDate,
        initialPrincipal: money(principal),
        fixationYears: 5,
        interestRatePa: rate("0.03"),
        monthlyInstalment: money(Math.ceil(principal / 150)),
      },
    ],
    valuations: [
      {
        id: "v",
        propertyId: "p",
        validFrom: isoDate("2026-06-01"),
        marketValue: money(3_000_000),
      },
    ],
    leases: [],
    holdingCosts: [],
  });

  it("equity₀ < 0 ⇒ CAGR null (nominal and real) // D-34", () => {
    const k = portfolioKpis(withLoan(6_000_000), assumptions);
    const eq0 = portfolioProjection(withLoan(6_000_000), assumptions)[0].equity;
    expect(eq0.isNegative()).toBe(true);
    expect(k.cagrNominal).toBeNull(); // D-34 (was 0)
    expect(k.cagrReal).toBeNull(); // D-34
  });

  it("equity₀ = 0 (nothing owned at baseDate) ⇒ CAGR null // D-34 (DR-107)", () => {
    const k = portfolioKpis(
      withLoan(1_000_000, isoDate("2028-01-15")),
      assumptions,
    );
    expect(k.cagrNominal).toBeNull(); // D-34 (was Infinity: ZERO.isPositive())
    expect(k.cagrReal).toBeNull(); // D-34
    expect(k.netWorthMultiple.isZero()).toBe(true);
  });

  it("DSCR is null in a projection year with no debt service", () => {
    const debtFree = portfolioProjection(portfolio, assumptions);
    const last = debtFree[assumptions.horizonYears];
    expect(last.debtService.isZero()).toBe(true);
    expect(last.dscr).toBeNull();
  });
});
