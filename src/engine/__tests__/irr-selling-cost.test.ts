// ADR 0183 (#148): `sellingCostPct` takes the selling costs off the levered IRR's terminal
// value only: terminal = cashToOwner_N + equity_N − value_N × sellingCostPct. Net worth and
// every other output are holding figures and do not move. The pins are cross-checked by
// the engine-free KPI reference model (reference/kpiReference.crossCheck.test.ts).
import { describe, it, expect } from "vitest";
import { portfolioKpis } from "../kpis";
import { portfolioProjection } from "../projections";
import { validateInputs } from "../validate";
import { applyScenario } from "../scenarios";
import { ONE, ZERO, type Decimal } from "../../lib/money";
import { rate } from "../brands";
import type { Assumptions } from "../types";
import { assumptions, portfolio, PARITY } from "./support/seed";
import { expectKc } from "./support/tolerance";

const at = (pct: string): Assumptions => ({
  ...assumptions,
  sellingCostPct: rate(pct),
});

describe("selling costs in the levered IRR's terminal value (ADR 0183)", () => {
  it("4 % lowers the seed's IRR and leaves net worth alone", () => {
    const k = portfolioKpis(portfolio, at("0.04"));
    expect(Number(k.leveredIrrNominal).toFixed(6)).toBe("0.060819");
    expect(Number(k.leveredIrrReal).toFixed(6)).toBe("0.034945");
    expectKc(k.netWorthNominal, PARITY.kpis.netWorthNominal);
  });

  it("changes nothing but the two IRRs", () => {
    const base = portfolioKpis(portfolio, assumptions);
    const sold = portfolioKpis(portfolio, at("0.04"));
    expect({
      ...sold,
      leveredIrrNominal: base.leveredIrrNominal,
      leveredIrrReal: base.leveredIrrReal,
    }).toEqual(base);
    expect(sold.leveredIrrNominal).not.toEqual(base.leveredIrrNominal);
    expect(portfolioProjection(portfolio, at("0.04"))).toEqual(
      portfolioProjection(portfolio, assumptions),
    );
  });

  it("0 and undefined give identical KPIs", () => {
    expect(portfolioKpis(portfolio, at("0"))).toEqual(
      portfolioKpis(portfolio, assumptions),
    );
  });

  it("at 100 % an IRR still exists", () => {
    const k = portfolioKpis(portfolio, at("1"));
    expect(Number(k.leveredIrrNominal).toFixed(6)).toBe("-0.010420");
    expect(k.leveredIrrNominalReason).toBeNull();
  });

  it("takes the rate off the horizon market value (value shock, ADR 0183 §1)", () => {
    // A value shock moves `value`; the IRR must be the root of the vector whose last
    // entry is cashToOwner_N + equity_N − value_N × rate.
    const a: Assumptions = {
      ...at("0.04"),
      valueShock: { pct: rate("0.2"), atYear: 5 },
    };
    const proj = portfolioProjection(portfolio, a);
    const n = proj.length - 1;
    const end = proj[n]!;
    const flows = proj.map((y, t) =>
      t === 0
        ? y.equity.negated()
        : t === n
          ? y.cashToOwner.plus(y.equity).minus(y.value.times("0.04"))
          : y.cashToOwner,
    );
    const npv = (r: Decimal) =>
      flows.reduce(
        (s, cf, t) => s.plus(cf.div(ONE.plus(r).pow(t))),
        ZERO as Decimal,
      );
    const irr = portfolioKpis(portfolio, a).leveredIrrNominal!;
    expect(npv(irr).abs().toNumber()).toBeLessThan(1);
    // The cost on value_N, discounted, is what separates this root from the cost-free one.
    const cost = end.value.times("0.04").div(ONE.plus(irr).pow(n));
    expect(cost.toNumber()).toBeGreaterThan(1000);
  });

  it("every scenario keeps the base rate (not a lever)", () => {
    expect(applyScenario(at("0.04"), {}).sellingCostPct?.toString()).toBe(
      "0.04",
    );
  });

  it.each(["1.5", "-0.01"])("refuses %s with RATE_OUT_OF_RANGE", (pct) => {
    expect(validateInputs(portfolio, at(pct))).toContainEqual(
      expect.objectContaining({
        code: "RATE_OUT_OF_RANGE",
        entity: "assumptions",
        field: "sellingCostPct",
      }),
    );
  });
});
