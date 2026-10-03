// D-47: a successor block pays off its predecessor. The net refinance cash (balance
// drawn − balance paid off) is counted in the handover year in cumulative net cash flow
// and levered IRR, like the acquisition outflow; the projection rows are unchanged.
import { describe, it, expect } from "vitest";
import { irr, portfolioKpis } from "../kpis";
import { portfolioProjection } from "../projections";
import { propertySchedule } from "../schedule";
import { isoDate } from "../dates";
import { D, ZERO, type Decimal } from "../../lib/money";
import { rate } from "../brands";
import type { MortgageBlock, Portfolio } from "../types";
import { assumptions, portfolio } from "./support/seed";
import { KC, RATIO, near } from "./support/tolerance";
import { money } from "../brands";

const N = assumptions.horizonYears;

const refi = (start: string, principal: Decimal): MortgageBlock => ({
  id: "m-refi",
  propertyId: "javorova",
  startDate: isoDate(start),
  initialPrincipal: money(principal),
  fixationYears: 5,
  interestRatePa: rate("0.039"),
  monthlyInstalment: money("9800"),
});

const withRefi = (block: MortgageBlock): Portfolio => ({
  ...portfolio,
  mortgages: [...portfolio.mortgages, block],
});

/** The one handover of Javorova's chain. */
function handover(p: Portfolio) {
  const blocks = p.mortgages.filter((m) => m.propertyId === "javorova");
  const [r] = propertySchedule(blocks, assumptions).refinances;
  if (!r) throw new Error("expected a handover");
  return { year: Math.ceil(r.month / 12), cash: r.drawn.minus(r.paidOff) };
}

/** KPIs recomputed from the projection plus the refinance cash in its year. */
function expectedKpis(p: Portfolio) {
  const proj = portfolioProjection(p, assumptions);
  const { year, cash } = handover(p);
  const extra = (t: number) => (t === year ? cash : ZERO);
  const vector = proj.map((y, t) => {
    if (t === 0) return y.equity.negated();
    const cf = y.netCashFlow.plus(extra(t));
    return t === N ? cf.plus(y.equity) : cf;
  });
  const cumulative = proj
    .slice(1)
    .reduce((s, y, i) => s.plus(y.netCashFlow).plus(extra(i + 1)), ZERO);
  return { cumulative, irrNominal: irr(vector), cash };
}

describe("D-47: net refinance cash in the KPIs", () => {
  // Javorova refixed on its fixation end (grid month 56, projection year 5).
  const paidOff = propertySchedule(
    withRefi(refi("2031-01-17", D("1633000"))).mortgages.filter(
      (m) => m.propertyId === "javorova",
    ),
    assumptions,
  ).refinances[0]?.paidOff;
  if (!paidOff) throw new Error("expected a handover");

  const cases: [string, Decimal, "in" | "out" | "none"][] = [
    ["cash-out refinance", D("2500000"), "in"],
    ["pay-down refinance", D("1200000"), "out"],
    ["same amount", paidOff, "none"],
  ];

  it.each(cases)("%s: cumulative net CF and IRR include it", (_, p0, sign) => {
    const p = withRefi(refi("2031-01-17", p0));
    const k = portfolioKpis(p, assumptions);
    const want = expectedKpis(p);
    expect(handover(p).year).toBe(5);
    if (sign === "in") expect(want.cash.greaterThan(ZERO)).toBe(true);
    if (sign === "out") expect(want.cash.isNegative()).toBe(true);
    if (sign === "none") expect(want.cash.isZero()).toBe(true);
    near(k.cumulativeNetCashFlow, want.cumulative.toNumber(), KC, "cum CF");
    if (!k.leveredIrrNominal || !want.irrNominal)
      throw new Error("IRR expected");
    near(k.leveredIrrNominal, want.irrNominal.toNumber(), RATIO, "IRR");
  });

  it("a cash-out refinance raises cumulative CF by exactly the cash", () => {
    const out = withRefi(refi("2031-01-17", D("2500000")));
    const same = withRefi(refi("2031-01-17", paidOff));
    const delta = portfolioKpis(out, assumptions).cumulativeNetCashFlow.minus(
      portfolioKpis(same, assumptions).cumulativeNetCashFlow,
    );
    // The larger loan also costs more debt service over the rest of the horizon.
    const dsDelta = portfolioProjection(out, assumptions)
      .slice(1)
      .reduce((s, y, i) => {
        const base = portfolioProjection(same, assumptions)[i + 1];
        return s.plus(y.netCashFlow.minus(base.netCashFlow));
      }, ZERO);
    near(
      delta.minus(dsDelta),
      D("2500000").minus(paidOff).toNumber(),
      KC,
      "Δ cash",
    );
  });

  it("a refinance after the horizon adds no cash", () => {
    const late = withRefi(refi("2057-01-17", D("100000")));
    near(
      portfolioKpis(late, assumptions).cumulativeNetCashFlow,
      portfolioKpis(portfolio, assumptions).cumulativeNetCashFlow.toNumber(),
      KC,
      "late refi",
    );
  });
});
