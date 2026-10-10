// Equity-change decomposition: each year's bar splits the equity delta into appreciation
// (value Δ) and debt paydown (balance Δ). The defining property is reconciliation — the
// two stacks must sum *exactly* to equity[t]−equity[t−1] under either lens. Driven off the
// real engine fixtures via the projection lens.
import { describe, it, expect } from "vitest";
import { portfolio, assumptions } from "../../../engine/__tests__/support/seed";
import {
  isoDate,
  money,
  portfolioProjection,
  rate,
  type Portfolio,
} from "../../../engine";
import { projectionSeries, type SeriesRow } from "../projection";
import { hasPurchases, toEquityChangeRows } from "../chartData";
import { devBlock, mixed } from "../../../engine/__tests__/support/mixed";
import { D, ZERO } from "../../../lib/money";
import { toNumber } from "../../../lib/format";

const projection = portfolioProjection(portfolio, assumptions);
const nominal = projectionSeries(projection, "nominal", assumptions);
const real = projectionSeries(projection, "real", assumptions);

describe("toEquityChangeRows", () => {
  it("omits the opening row (year 0) and starts at year 1", () => {
    const rows = toEquityChangeRows(nominal);
    expect(rows.length).toBe(nominal.length - 1);
    expect(rows[0].calendarYear).toBe(nominal[1].calendarYear);
    expect(rows[rows.length - 1].calendarYear).toBe(
      nominal[nominal.length - 1].calendarYear,
    );
  });

  it("returns an empty array for empty or opening-only input", () => {
    expect(toEquityChangeRows([])).toEqual([]);
    expect(toEquityChangeRows([nominal[0]])).toEqual([]);
  });

  it("reconciles: appreciation + paydown + drawdown === equity[t] − equity[t−1] (nominal)", () => {
    const rows = toEquityChangeRows(nominal);
    rows.forEach((r, i) => {
      const equityDelta = toNumber(
        nominal[i + 1].equity.minus(nominal[i].equity),
      );
      expect(r.appreciation + r.paydown + r.drawdown).toBeCloseTo(
        equityDelta,
        6,
      );
    });
  });

  it("reconciles under the real lens too", () => {
    const rows = toEquityChangeRows(real);
    rows.forEach((r, i) => {
      const equityDelta = toNumber(real[i + 1].equity.minus(real[i].equity));
      expect(r.appreciation + r.paydown + r.drawdown).toBeCloseTo(
        equityDelta,
        6,
      );
    });
  });

  it("base case (no future debt draws): paydown equals annual principal, drawdown is zero", () => {
    const rows = toEquityChangeRows(nominal);
    rows.forEach((r, i) => {
      // For the seed portfolio no new debt is drawn after baseDate, so the balance falls
      // by exactly the year's principal repaid and there is no drawdown.
      expect(r.paydown).toBeCloseTo(toNumber(nominal[i + 1].principal), 6);
      expect(r.drawdown).toBeCloseTo(0, 6);
    });
  });

  it("real lens, no future debt draws: drawdown is zero every year (regression)", () => {
    // Regression for the phantom-drawdown bug: in real terms balance[t] and balance[t−1]
    // carry different deflators, so backing draws out of the *lensed* balances left a residual
    // that surfaced as spurious drawdown bars. With draws backed out of nominal balances it
    // must stay exactly zero for the seed portfolio (which draws no new debt after baseDate).
    const rows = toEquityChangeRows(real);
    rows.forEach((r, i) => {
      expect(r.drawdown).toBeCloseTo(0, 6);
      expect(r.paydown).toBeCloseTo(toNumber(real[i + 1].principal), 6);
    });
  });

  it("development draw year: shows a negative drawdown bar, paydown stays the principal", () => {
    // Synthetic two-year series: year 1 draws 1,000,000 of new debt while repaying 50,000
    // of principal (balance rises by 950,000), and the value ramps by 1,200,000.
    const row = (
      year: number,
      value: string,
      balance: string,
      principal: string,
      draws: string,
      prepaid = "0",
      acquired = "0",
    ): SeriesRow => ({
      year,
      calendarYear: 2026 + year,
      value: D(value),
      balance: D(balance),
      committedDebt: D(balance),
      undrawnDebt: ZERO,
      reportedValue: D(value),
      equity: D(value).minus(D(balance)),
      ltv: ZERO,
      grossRent: ZERO,
      effectiveRent: ZERO,
      holdingCosts: ZERO,
      noi: ZERO,
      interest: ZERO,
      principal: D(principal),
      debtService: ZERO,
      netCashFlow: ZERO,
      cashToOwner: ZERO,
      dscr: null,
      draws: D(draws),
      committedDraws: D(draws),
      acquiredValue: D(acquired),
      refinanced: D(0),
      prepaid: D(prepaid),
      prepaymentFees: D(0),
    });
    const series = [
      row(0, "2000000", "1000000", "0", "0"),
      row(1, "3200000", "1950000", "50000", "1000000"),
    ];
    const [r] = toEquityChangeRows(series);
    expect(r.appreciation).toBeCloseTo(1200000, 6);
    expect(r.paydown).toBeCloseTo(50000, 6); // true principal repaid, not the net balance move
    expect(r.drawdown).toBeCloseTo(-1000000, 6); // gross new debt drawn, shown as a negative bar
    // Still reconciles to the equity delta.
    const equityDelta = toNumber(series[1].equity.minus(series[0].equity));
    expect(r.appreciation + r.paydown + r.drawdown).toBeCloseTo(equityDelta, 6);

    // ADR 0109: a 300,000 prepayment is paydown too; appreciation stays the value ramp.
    const prepaid = [
      row(0, "2000000", "1000000", "0", "0"),
      row(1, "3200000", "650000", "50000", "0", "300000"),
    ];
    const [p] = toEquityChangeRows(prepaid);
    expect(p.appreciation).toBeCloseTo(1200000, 6);
    expect(p.paydown).toBeCloseTo(350000, 6);
    expect(p.appreciation + p.paydown + p.drawdown).toBeCloseTo(
      toNumber(prepaid[1].equity.minus(prepaid[0].equity)),
      6,
    );
  });
});

// ADR 0165 (#126 item 2): a flat bought in year t brings its value in as a purchase, not
// as appreciation. The four stacks still sum exactly to the equity change.
describe("toEquityChangeRows: purchases (ADR 0165)", () => {
  const mixedProjection = portfolioProjection(mixed, assumptions);
  const lenses = {
    nominal: projectionSeries(mixedProjection, "nominal", assumptions),
    real: projectionSeries(mixedProjection, "real", assumptions),
  };
  // "Future buy" (purchase 15.03.2028) turns on in projection year 2.
  const BUY_YEAR = 2;

  it.each(["nominal", "real"] as const)(
    "the purchase year's bar carries the acquired value as purchases (%s)",
    (lens) => {
      const series = lenses[lens];
      const rows = toEquityChangeRows(series);
      const buy = rows.find((r) => r.year === BUY_YEAR)!;
      expect(toNumber(series[BUY_YEAR].acquiredValue)).toBeGreaterThan(0);
      // Each year: the value bought in plus the dev flat's drawn tranches (ADR 0170).
      rows.forEach((r) => {
        const cur = series[r.year];
        expect(r.purchases).toBeCloseTo(
          toNumber(cur.acquiredValue.plus(cur.draws).minus(cur.committedDraws)),
          6,
        );
      });
      expect(buy.purchases).toBeGreaterThanOrEqual(
        toNumber(series[BUY_YEAR].acquiredValue),
      );
    },
  );

  it("nominal appreciation is the value change less the value bought in", () => {
    const series = lenses.nominal;
    toEquityChangeRows(series).forEach((r, i) => {
      const cur = series[i + 1];
      const valueDelta = cur.value
        .minus(series[i].value)
        .minus(cur.acquiredValue);
      expect(r.appreciation).toBeCloseTo(toNumber(valueDelta), 6);
    });
  });

  it.each(["nominal", "real"] as const)(
    "reconciles: appreciation + purchases + paydown + drawdown === equity Δ (%s)",
    (lens) => {
      const series = lenses[lens];
      toEquityChangeRows(series).forEach((r, i) => {
        const equityDelta = toNumber(
          series[i + 1].equity.minus(series[i].equity),
        );
        expect(
          r.appreciation + r.purchases + r.paydown + r.drawdown,
        ).toBeCloseTo(equityDelta, 6);
      });
    },
  );

  it("hasPurchases is true only when some year has a purchase", () => {
    expect(hasPurchases(toEquityChangeRows(lenses.nominal))).toBe(true);
    expect(hasPurchases(toEquityChangeRows(nominal))).toBe(false);
    expect(hasPurchases([])).toBe(false);
  });
});

// ADR 0170: a development loan's draws show as they happen. Each draw is drawn new debt
// and the value it releases into the Purchases stack (the fall in the undrawn tranches),
// so the two cancel and the stacks still sum to the equity change, under either lens.
describe("toEquityChangeRows: development draws (ADR 0170)", () => {
  const only = <T extends { propertyId: string }>(rows: T[]) =>
    rows.filter((r) => r.propertyId === "dev");
  const devOnly = {
    properties: mixed.properties.filter((p) => p.id === "dev"),
    mortgages: only(mixed.mortgages),
    valuations: only(mixed.valuations),
    leases: only(mixed.leases),
    holdingCosts: [],
  };
  const devProjection = portfolioProjection(devOnly, assumptions);

  it.each(["nominal", "real"] as const)(
    "an owned flat's tranche years (1 and 2) show the draw as value and new debt (%s)",
    (lens) => {
      const series = projectionSeries(devProjection, lens, assumptions);
      const rows = toEquityChangeRows(series);
      expect(toNumber(series[1].draws)).toBeGreaterThan(0);
      expect(toNumber(series[2].draws)).toBeGreaterThan(0);
      rows.forEach((r, i) => {
        const draws = toNumber(series[i + 1].draws);
        expect(r.drawdown).toBeCloseTo(-draws, 6);
        expect(r.purchases).toBeCloseTo(draws, 6);
        const equityDelta = toNumber(
          series[i + 1].equity.minus(series[i].equity),
        );
        expect(
          r.appreciation + r.purchases + r.paydown + r.drawdown,
        ).toBeCloseTo(equityDelta, 4);
      });
      expect(hasPurchases(rows)).toBe(true);
    },
  );

  // A flat bought on 2027-03-01 (projection year 1) with a 2.0M development loan drawn on
  // the purchase date and tranches of 1.5M (2027-11-15, year 2) and 1.0M (2028-08-20,
  // year 3); completed value 9.5M.
  const futureDev: Portfolio = {
    ...devOnly,
    properties: [
      {
        id: "dev",
        name: "Dev unit",
        purchaseDate: isoDate("2027-03-01"),
        purchasePrice: money("7000000"),
      },
    ],
    mortgages: [
      {
        ...devBlock,
        startDate: isoDate("2027-03-01"),
        loanTermYears: 30,
        draws: [
          { date: isoDate("2027-11-15"), amount: money("1500000") },
          { date: isoDate("2028-08-20"), amount: money("1000000") },
        ],
        completionDate: isoDate("2028-08-20"),
      },
    ],
    valuations: [
      {
        id: "v-dev",
        propertyId: "dev",
        validFrom: isoDate("2027-03-01"),
        marketValue: money("9500000"),
      },
    ],
  };
  const futureProjection = portfolioProjection(futureDev, assumptions);

  it("a future buy's turn-on year shows the value less the undrawn tranches and the amount drawn", () => {
    const series = projectionSeries(futureProjection, "nominal", assumptions);
    const [y1, y2, y3, y4] = toEquityChangeRows(series);
    expect(y1.purchases).toBeCloseTo(9_500_000 - 2_500_000, 0);
    expect(y1.drawdown).toBeCloseTo(-2_000_000, 0);
    expect(y2.purchases).toBeCloseTo(1_500_000, 0);
    expect(y2.drawdown).toBeCloseTo(-1_500_000, 0);
    expect(y3.purchases).toBeCloseTo(1_000_000, 0);
    expect(y3.drawdown).toBeCloseTo(-1_000_000, 0);
    expect(y4.purchases).toBe(0);
    expect(y4.drawdown).toBeCloseTo(0, 6);
  });

  it.each(["nominal", "real"] as const)(
    "a future buy: Σ purchases = Σ value bought in, and the stacks reconcile (%s)",
    (lens) => {
      const series = projectionSeries(futureProjection, lens, assumptions);
      const rows = toEquityChangeRows(series);
      const bought = series.reduce((s, r) => s.plus(r.acquiredValue), ZERO);
      const drawnIn = series.reduce(
        (s, r) => s.plus(r.draws).minus(r.committedDraws),
        ZERO,
      );
      expect(rows.reduce((s, r) => s + r.purchases, 0)).toBeCloseTo(
        toNumber(bought.plus(drawnIn)),
        4,
      );
      // Nominal: every tranche is drawn by the horizon, so the value drawn in totals the
      // undrawn part at turn-on and Σ purchases is the completed value.
      if (lens === "nominal") {
        expect(rows.reduce((s, r) => s + r.purchases, 0)).toBeCloseTo(
          toNumber(bought),
          0,
        );
      }
      rows.forEach((r, i) => {
        const equityDelta = toNumber(
          series[i + 1].equity.minus(series[i].equity),
        );
        expect(
          r.appreciation + r.purchases + r.paydown + r.drawdown,
        ).toBeCloseTo(equityDelta, 4);
      });
    },
  );

  // Review of PR 305: a plain loan refinanced on 2027-01-01 (year 1) into a development
  // loan with a 1.0M tranche on 2027-11-15 (year 2). The handover commits the tranche with
  // no draw and no value: that is new committed debt, not a negative purchase.
  it.each(["nominal", "real"] as const)(
    "a handover into a development loan shows its undrawn tranche as new debt, not a negative purchase (%s)",
    (lens) => {
      const pf: Portfolio = {
        ...devOnly,
        mortgages: [
          {
            id: "m-plain",
            propertyId: "dev",
            startDate: isoDate("2026-03-01"),
            initialPrincipal: money("3000000"),
            fixationYears: 5,
            interestRatePa: rate("0.049"),
            monthlyInstalment: money("16000"),
          },
          {
            ...devBlock,
            id: "m-dev-refi",
            startDate: isoDate("2027-01-01"),
            initialPrincipal: money("2900000"),
            loanTermYears: 30,
            draws: [{ date: isoDate("2027-11-15"), amount: money("1000000") }],
            completionDate: isoDate("2027-11-15"),
          },
        ],
      };
      const series = projectionSeries(
        portfolioProjection(pf, assumptions),
        lens,
        assumptions,
      );
      const rows = toEquityChangeRows(series);
      const [y1, y2] = rows;
      const committed = toNumber(series[1].undrawnDebt);
      expect(committed).toBeGreaterThan(0);
      expect(y1.purchases).toBe(0);
      expect(y1.drawdown).toBeCloseTo(
        -toNumber(series[1].refinanced) - committed,
        4,
      );
      const drawn = toNumber(series[2].draws);
      expect(drawn).toBeGreaterThan(0);
      expect(y2.purchases).toBeCloseTo(drawn, 4);
      expect(y2.drawdown).toBeCloseTo(-drawn, 4);
      rows.forEach((r, i) => {
        expect(r.purchases).toBeGreaterThanOrEqual(0);
        const equityDelta = toNumber(
          series[i + 1].equity.minus(series[i].equity),
        );
        expect(
          r.appreciation + r.purchases + r.paydown + r.drawdown,
        ).toBeCloseTo(equityDelta, 4);
      });
    },
  );

  it("a plain loan's draw adds no purchase", () => {
    const series = projectionSeries(
      portfolioProjection(mixed, assumptions),
      "nominal",
      assumptions,
    ).map((r) => ({ ...r, draws: D("500000"), committedDraws: D("500000") }));
    toEquityChangeRows(series).forEach((r, i) => {
      expect(r.purchases).toBeCloseTo(toNumber(series[i + 1].acquiredValue), 6);
      expect(r.drawdown).toBeCloseTo(
        -500_000 - toNumber(series[i + 1].refinanced),
        6,
      );
    });
  });
});
