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
import { money } from "../brands";
import { ZERO } from "../../lib/money";
import type { MortgageBlock, Portfolio } from "../types";
import { assumptions } from "./support/seed";
import { mixedWithRefi } from "./support/synthetic";

// The future buy (purchase 15.03.2028) with its loan drawn before baseDate (pre-purchase
// debt service, ADR 0124) and a 300,000 Kč prepayment with a 3,000 Kč fee (ADR 0109);
// `mixedWithRefi` adds Javorova's cash-out refinance (D-47).
const fixture: Portfolio = {
  ...mixedWithRefi,
  mortgages: mixedWithRefi.mortgages.map((m): MortgageBlock =>
    m.id === "m-future"
      ? {
          ...m,
          startDate: isoDate("2026-01-10"),
          prepayments: [
            {
              date: isoDate("2030-03-15"),
              amount: money("300000"),
              effect: "shortenTerm",
              fee: money("3000"),
            },
          ],
        }
      : m,
  ),
};

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
      fixture.properties,
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
      cumulativeNetCashFlow: "15087662.58191198391585101309654212160737",
      cumulativeNetCashFlowReal: "6835100.424693427509605481896134653967037",
      leveredIrrNominal: "0.0667712288484290253029462824940765131034",
      leveredIrrReal: "0.04075241838871124545884416789931492530743",
      leveredIrrNominalReason: null,
      leveredIrrRealReason: null,
    });
  });
});
