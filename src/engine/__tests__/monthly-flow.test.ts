// #481 (ADR 0200, 0215): a portfolio's or a property's flow per month is an engine
// figure: the annual rent collected, and holding costs plus debt service, ÷ 12. The net
// is their difference, which is the annual net cash flow ÷ 12.
import { describe, it, expect } from "vitest";
import { monthlyFlow } from "../figures";
import { portfolioSnapshot } from "../metrics";
import { D } from "../../lib/money";
import { assumptions, portfolio } from "./support/seed";
import { mixed } from "./support/mixed";

describe("monthlyFlow", () => {
  it("divides the annual inflow and outflow by 12", () => {
    const f = monthlyFlow({
      effectiveGrossIncome: D("120000"),
      holdingCosts: D("24000"),
      annualDebtService: D("60000"),
    });
    expect(f.inflow.toString()).toBe("10000");
    expect(f.outflow.toString()).toBe("7000");
    expect(f.net.toString()).toBe("3000");
  });

  it("keeps full precision (rounding is for display)", () => {
    const f = monthlyFlow({
      effectiveGrossIncome: D("1"),
      holdingCosts: D("0"),
      annualDebtService: D("0"),
    });
    expect(f.inflow.eq(D(1).div(12))).toBe(true);
  });

  it.each([
    ["seed", portfolio],
    ["mixed", mixed],
  ] as const)(
    "has a net of the snapshot's net cash flow ÷ 12, portfolio and per property (%s)",
    (_name, p) => {
      const s = portfolioSnapshot(p, assumptions);
      for (const x of [s, ...s.perProperty]) {
        const net = monthlyFlow(x).net;
        expect(net.minus(x.netCashFlow.div(12)).abs().lessThan("1e-20")).toBe(
          true,
        );
      }
    },
  );

  it("matches the parity snapshot's annual figures on the seed", () => {
    const f = monthlyFlow(portfolioSnapshot(portfolio, assumptions));
    expect(f.inflow.times(12).toString()).toBe("804270");
    expect(f.outflow.times(12).toDecimalPlaces(6).toString()).toBe("855254.7");
  });
});
