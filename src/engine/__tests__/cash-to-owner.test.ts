// ADR 0161 (#117 R8-04): each projection year carries `cashToOwner` = net cash flow −
// the cash outside it (acquisitions, refinance cash, prepayments with their fees, debt
// service before a future buy). Σ of the portfolio row over years 1..N is the
// cumulative cash flow KPI, nominal and real, so the Dashboard tile reconciles with the
// projection grid.
import { describe, it, expect } from "vitest";
import { ZERO, type Decimal } from "../../lib/money";
import { money, rate } from "../brands";
import { isoDate } from "../dates";
import { portfolioKpis } from "../kpis";
import {
  cpiIndex,
  portfolioProjection,
  propertyProjection,
} from "../projections";
import { realProjection } from "../real";
import { propertySchedules } from "../schedule";
import type { MortgageBlock, Portfolio, ProjectionYear } from "../types";
import { assumptions, portfolio } from "./support/seed";
import { mixedCashOutside } from "./support/synthetic";

const N = assumptions.horizonYears;

/** Σ over years 1..N of a field, in year order (the order the KPI sums in). */
const sum = (proj: ProjectionYear[], f: (y: ProjectionYear) => Decimal) =>
  proj.slice(1, N + 1).reduce((s, y) => s.plus(f(y)), ZERO);

/** Each active property's projection on the same schedules as the portfolio's. */
function perProperty(p: Portfolio): Map<string, ProjectionYear[]> {
  const schedules = propertySchedules(
    p.mortgages,
    p.properties.map((x) => x.id),
    assumptions,
  );
  return new Map(
    p.properties
      .filter((x) => x.active !== false)
      .map((x) => [
        x.id,
        propertyProjection(x, p, assumptions, schedules.get(x.id)!),
      ]),
  );
}

/** Largest |portfolio row − Σ property rows| of `cashToOwner` over years 0..N. */
function propertyGap(p: Portfolio): number {
  const proj = portfolioProjection(p, assumptions);
  const props = [...perProperty(p).values()];
  let gap = 0;
  for (let t = 0; t <= N; t++) {
    const total = props.reduce((s, yrs) => s.plus(yrs[t]!.cashToOwner), ZERO);
    gap = Math.max(gap, total.minus(proj[t]!.cashToOwner).abs().toNumber());
  }
  return gap;
}

/** The KPIs and the projection reconcile: Σ cashToOwner is the cumulative cash flow,
 *  nominal and real, to every digit (both sum the same values in the same order). */
function expectReconciles(p: Portfolio) {
  const proj = portfolioProjection(p, assumptions);
  const k = portfolioKpis(p, assumptions);
  expect(sum(proj, (y) => y.cashToOwner).toString()).toBe(
    k.cumulativeNetCashFlow.toString(),
  );
  const real = realProjection(proj, cpiIndex(assumptions));
  expect(sum(real, (y) => y.cashToOwner).toString()).toBe(
    k.cumulativeNetCashFlowReal.toString(),
  );
  expect(proj[0]!.cashToOwner.isZero()).toBe(true);
}

// Probe R8-5: the sample with a 1,000,000 Kč shortenTerm prepayment and a 5,000 Kč fee
// on Byt Lipova on 15.01.2027 (projection year 1).
const prepaid: Portfolio = {
  ...portfolio,
  mortgages: portfolio.mortgages.map((m): MortgageBlock =>
    m.propertyId === "lipova"
      ? {
          ...m,
          prepayments: [
            {
              date: isoDate("2027-01-15"),
              amount: money("1000000"),
              effect: "shortenTerm",
              fee: money("5000"),
            },
          ],
        }
      : m,
  ),
};

describe("ADR 0161: cash to owner", () => {
  it("is net cash flow on the sample, which has no cash outside it", () => {
    const proj = portfolioProjection(portfolio, assumptions);
    for (const y of proj.slice(1)) {
      expect(y.cashToOwner.toString()).toBe(y.netCashFlow.toString());
    }
    expectReconciles(portfolio);
  });

  it("probe R8-5: the tile sums cash to owner; Net CF differs by prepaid + fee", () => {
    const proj = portfolioProjection(prepaid, assumptions);
    expectReconciles(prepaid);
    const gap = sum(proj, (y) => y.netCashFlow).minus(
      sum(proj, (y) => y.cashToOwner),
    );
    expect(gap.toFixed(2)).toBe("1005000.00");
    // In the prepayment's year only: 1,005,000 Kč less than net cash flow.
    expect(proj[1]!.netCashFlow.minus(proj[1]!.cashToOwner).toFixed(2)).toBe(
      "1005000.00",
    );
    // Each property's row carries its own share (Byt Lipova's here).
    const lipova = perProperty(prepaid).get("lipova")!;
    expect(
      lipova[1]!.netCashFlow.minus(lipova[1]!.cashToOwner).toFixed(2),
    ).toBe("1005000.00");
    expect(propertyGap(prepaid)).toBeLessThanOrEqual(1e-9);
  });

  it("reconciles on acquisition, refinance, prepayment and pre-purchase cash", () => {
    // `mixedCashOutside` also has a deactivated flat with a loan: it adds nothing.
    expectReconciles(mixedCashOutside);
    // The portfolio row is Σ net cash flow − the portfolio's cash outside it, not Σ of
    // the property rows (that would sum in another order and move the KPI's last
    // digits); the two agree far below a haléř.
    expect(propertyGap(mixedCashOutside)).toBeLessThanOrEqual(1e-9);
    const props = perProperty(mixedCashOutside);
    expect(props.has("inactive")).toBe(false);
    // Before the future buy turns on (year 2), its row has no net cash flow but the
    // owner pays the debt service of the loan drawn before the purchase (ADR 0124).
    const future = props.get("future")!;
    expect(future[1]!.netCashFlow.isZero()).toBe(true);
    expect(future[1]!.cashToOwner.isNegative()).toBe(true);
  });

  it("a successor's handover-month tranche counts as refinance cash (D-47)", () => {
    // Javorova's successor on 17.01.2031 (grid month 56, year 5) pays off 1,386,249.89 Kč
    // with 1,386,000 Kč and draws a 100,000 Kč tranche in the handover month.
    const p: Portfolio = {
      ...portfolio,
      mortgages: [
        ...portfolio.mortgages,
        {
          id: "m-refi",
          propertyId: "javorova",
          startDate: isoDate("2031-01-17"),
          initialPrincipal: money("1386000"),
          fixationYears: 5,
          interestRatePa: rate("0.039"),
          monthlyInstalment: money("9800"),
          loanTermYears: 20,
          completionDate: isoDate("2032-01-17"),
          draws: [{ date: isoDate("2031-01-30"), amount: money("100000") }],
        } as MortgageBlock,
      ],
    };
    const javorova = perProperty(p).get("javorova")!;
    expect(
      javorova[5]!.cashToOwner.minus(javorova[5]!.netCashFlow).toFixed(2),
    ).toBe("99750.11");
    expectReconciles(p);
  });

  it("a buy after the horizon on a loan drawn before baseDate: debt service only", () => {
    const p: Portfolio = {
      ...mixedCashOutside,
      properties: mixedCashOutside.properties.map((x) =>
        x.id === "future" ? { ...x, purchaseDate: isoDate("2060-03-15") } : x,
      ),
    };
    const future = perProperty(p).get("future")!;
    const schedule = propertySchedules(
      p.mortgages,
      ["future"],
      assumptions,
    ).get("future")!;
    // Every year's row is empty, and the owner pays the loan's months 1..12N.
    const paid = schedule.rows
      .filter((r) => r.month <= N * 12)
      .reduce(
        (s, r) =>
          s
            .plus(r.interest)
            .plus(r.principal)
            .plus(r.prepaid)
            .plus(r.prepaymentFee),
        ZERO,
      );
    expect(sum(future, (y) => y.netCashFlow).isZero()).toBe(true);
    expect(sum(future, (y) => y.cashToOwner).toFixed(6)).toBe(
      paid.negated().toFixed(6),
    );
    expectReconciles(p);
    expect(propertyGap(p)).toBeLessThanOrEqual(1e-9);
  });
});
