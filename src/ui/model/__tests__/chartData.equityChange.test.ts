// Equity-change decomposition: each year's bar splits the equity delta into appreciation
// (value Δ) and debt paydown (balance Δ). The defining property is reconciliation — the
// two stacks must sum *exactly* to equity[t]−equity[t−1] under either lens. Driven off the
// real engine fixtures via the projection lens.
import { describe, it, expect } from "vitest";
import { portfolio, assumptions } from "../../../engine/__tests__/support/seed";
import { portfolioProjection } from "../../../engine";
import { projectionSeries, type SeriesRow } from "../projection";
import { toEquityChangeRows } from "../chartData";
import { D, ZERO, toNumber } from "../../../lib/money";

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
    ): SeriesRow => ({
      year,
      calendarYear: 2026 + year,
      value: D(value),
      balance: D(balance),
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
      dscr: null,
      draws: D(draws),
      prepaid: D(prepaid),
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
