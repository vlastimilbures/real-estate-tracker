// #117 (R2-17): characterisation pins for the KPIs built from net cash flow minus the
// cash outside it (acquisitions, refinance cash, prepayments with their fees, and the
// debt service paid before a future buy turns on). The golden master leaves out
// `cumulativeNetCashFlowReal`, and its fixtures have no refinance or prepayment, so
// these exact values (recorded before the refactor) prove it is behaviour-neutral.
import { describe, it, expect } from "vitest";
import { portfolioKpis } from "../kpis";
import { portfolioProjection } from "../projections";
import { prePurchaseDebtService } from "../ownerCash";
import { turnOnYear } from "../yearGrid";
import { propertySchedules } from "../schedule";
import { isoDate } from "../dates";
import { ZERO } from "../../lib/money";
import { assumptions } from "./support/seed";
import { mixedCashOutside } from "./support/synthetic";

const fixture = mixedCashOutside;

describe("#117: the KPIs net of the cash outside net cash flow", () => {
  // Not here: prepayments before the turn-on and a later first loan's cash in (pinned in
  // pre-purchase-debt-service.test.ts and acquisition-cash.test.ts).
  it("the fixture has acquisition, refinance, prepayment and pre-purchase cash", () => {
    const schedules = propertySchedules(
      fixture.mortgages,
      fixture.properties.map((p) => p.id),
      assumptions,
    );
    const proj = portfolioProjection(fixture, assumptions);
    const pre = prePurchaseDebtService(
      fixture.properties.filter((p) => p.active !== false),
      assumptions,
      schedules,
    );
    // Javorova's refinance hands over in year 5 and releases cash.
    const refis = schedules.get("javorova")?.refinances ?? [];
    expect(refis.length).toBe(1);
    expect(Math.ceil(refis[0]!.month / 12)).toBeLessThanOrEqual(
      assumptions.horizonYears,
    );
    expect(refis[0]!.drawn.greaterThan(refis[0]!.paidOff)).toBe(true);
    // The future buy turns on inside the horizon (its down payment) and its loan ran
    // before it.
    const tStart = turnOnYear(isoDate("2028-03-15"), assumptions);
    expect(tStart).toBeGreaterThan(0);
    expect(tStart).toBeLessThanOrEqual(assumptions.horizonYears);
    const sum = (f: (t: number) => typeof ZERO) =>
      proj.reduce((s, _, t) => s.plus(f(t)), ZERO);
    expect(sum((t) => pre[t]!.principal).greaterThan(ZERO)).toBe(true);
    expect(sum((t) => proj[t]!.prepaid).greaterThan(ZERO)).toBe(true);
    expect(sum((t) => proj[t]!.prepaymentFees).greaterThan(ZERO)).toBe(true);
    expect(sum((t) => pre[t]!.interest).greaterThan(ZERO)).toBe(true);
  });

  // ADR 0165 moved these: the future buy's fixed holding costs inflate from the base
  // date (CPI_t), no longer from its turn-on year.
  // ADR 0166 moved the IRRs: the dev flat's year-0 equity is its completed value less
  // the whole loan, so its later tranche draws no longer add equity.
  it("pins the cumulative cash flow and the levered IRR", () => {
    const k = portfolioKpis(fixture, assumptions);
    expect({
      cumulativeNetCashFlow: k.cumulativeNetCashFlow.toString(),
      cumulativeNetCashFlowReal: k.cumulativeNetCashFlowReal.toString(),
      leveredIrrNominal: k.leveredIrrNominal?.toString() ?? null,
      leveredIrrReal: k.leveredIrrReal?.toString() ?? null,
      leveredIrrNominalReason: k.leveredIrrNominalReason,
      leveredIrrRealReason: k.leveredIrrRealReason,
    }).toEqual({
      cumulativeNetCashFlow: "15034596.92321763171557107335755497217649",
      cumulativeNetCashFlowReal: "6800388.720350774326976094626652203044966",
      leveredIrrNominal: "0.06276135050086684846748497079715889412925",
      leveredIrrReal: "0.0368403419520652189965426170914497561171",
      leveredIrrNominalReason: null,
      leveredIrrRealReason: null,
    });
  });
});
