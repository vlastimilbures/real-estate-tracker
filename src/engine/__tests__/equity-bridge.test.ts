// #481: the equity bridge (ADR 0165, 0170) and the value a year's purchases and
// construction add are engine formulas; the chart and the grid only show them. The
// bridge splits each year's equity change into appreciation, purchases, paydown and
// new debt, and the four sum to equity[t] − equity[t−1] up to Decimal's last digits.
import { describe, it, expect } from "vitest";
import { builtValue, equityBridge, purchasedValue } from "../equityBridge";
import { cpiIndex, portfolioProjection } from "../projections";
import { realProjection } from "../real";
import { isoDate } from "../dates";
import { money } from "../brands";
import { D, ZERO, type Decimal } from "../../lib/money";
import { assumptions, portfolio as seed } from "./support/seed";
import { devBlock, mixed } from "./support/mixed";
import type { MortgageBlock, Portfolio, ProjectionYear } from "../types";

// Decimal keeps 40 significant digits: sums of 1e7 Kč figures agree far below 1e-20 Kč.
const EPS = D("1e-20");
const same = (a: Decimal, b: Decimal) => a.minus(b).abs().lessThan(EPS);

const lenses = (p: Portfolio) => {
  const nominal = portfolioProjection(p, assumptions);
  return { nominal, real: realProjection(nominal, cpiIndex(assumptions)) };
};

// A flat bought on 2027-03-01 (projection year 1) with a 2.0M development loan drawn on
// the purchase date and tranches of 1.5M (year 2) and 1.0M (year 3); value 9.5M.
const futureDev: Portfolio = {
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
      draws: [
        { date: isoDate("2027-11-15"), amount: money("1500000") },
        { date: isoDate("2028-08-20"), amount: money("1000000") },
      ],
      completionDate: isoDate("2028-08-20"),
    } as MortgageBlock,
  ],
  valuations: [
    {
      id: "v-dev",
      propertyId: "dev",
      validFrom: isoDate("2027-03-01"),
      marketValue: money("9500000"),
    },
  ],
  leases: [],
  holdingCosts: [],
};

type Flows = Pick<ProjectionYear, "draws" | "committedDraws" | "acquiredValue">;
const flows = (draws: string, committed: string, acquired: string): Flows => ({
  draws: D(draws),
  committedDraws: D(committed),
  acquiredValue: D(acquired),
});

describe("builtValue / purchasedValue (ADR 0170, 0194)", () => {
  it("is zero in a year without draws or purchases", () => {
    expect(builtValue(flows("0", "0", "0")).toString()).toBe("0");
    expect(purchasedValue(flows("0", "0", "0")).toString()).toBe("0");
  });

  it("is the tranche drawn for construction in an owned flat", () => {
    // 1.5M drawn, all of it out of the committed tranches: committed debt is unchanged.
    expect(builtValue(flows("1500000", "0", "0")).toString()).toBe("1500000");
    expect(purchasedValue(flows("1500000", "0", "0")).toString()).toBe(
      "1500000",
    );
  });

  it("is capped at the year's draws", () => {
    // Undrawn tranches fall by more than the draws (a handover): only the draws build.
    expect(builtValue(flows("200", "-300", "0")).toString()).toBe("200");
  });

  it("is no lower than minus the value a purchase brings in", () => {
    // A purchase year: the bought flat's undrawn tranches enter, at most its value.
    expect(builtValue(flows("0", "3000", "1000")).toString()).toBe("-1000");
    expect(purchasedValue(flows("0", "3000", "1000")).toString()).toBe("0");
    expect(builtValue(flows("0", "500", "1000")).toString()).toBe("-500");
    expect(purchasedValue(flows("0", "500", "1000")).toString()).toBe("500");
  });

  it("is a new debt with no value when nothing is drawn or bought", () => {
    expect(builtValue(flows("0", "700", "0")).toString()).toBe("0");
  });
});

describe("equityBridge", () => {
  it("is empty without a year after the opening one", () => {
    const { nominal } = lenses(seed);
    expect(equityBridge([])).toEqual([]);
    expect(equityBridge(nominal.slice(0, 1))).toEqual([]);
  });

  it("starts at year 1 and keeps each year's labels", () => {
    const { nominal } = lenses(seed);
    const bridge = equityBridge(nominal);
    expect(bridge).toHaveLength(nominal.length - 1);
    bridge.forEach((b, i) => {
      expect(b.year).toBe(nominal[i + 1].year);
      expect(b.calendarYear).toBe(nominal[i + 1].calendarYear);
    });
  });

  it.each([
    ["seed", seed],
    ["mixed", mixed],
    ["future development", futureDev],
  ] as const)(
    "sums to the equity change under both lenses (%s)",
    (_name, p) => {
      for (const rows of Object.values(lenses(p))) {
        equityBridge(rows).forEach((b, i) => {
          const sum = b.appreciation
            .plus(b.purchases)
            .plus(b.paydown)
            .plus(b.drawdown);
          expect(same(sum, rows[i + 1].equity.minus(rows[i].equity))).toBe(
            true,
          );
        });
      }
    },
  );

  it("shows paydown as principal plus prepaid and purchases as purchasedValue", () => {
    for (const rows of Object.values(lenses(mixed))) {
      equityBridge(rows).forEach((b, i) => {
        const r = rows[i + 1];
        expect(b.paydown.eq(r.principal.plus(r.prepaid))).toBe(true);
        expect(b.purchases.eq(purchasedValue(r))).toBe(true);
      });
    }
  });

  it("is appreciation = value change for a nominal portfolio without draws or purchases", () => {
    const { nominal } = lenses(seed);
    equityBridge(nominal).forEach((b, i) => {
      expect(b.purchases.eq(ZERO)).toBe(true);
      expect(
        same(b.appreciation, nominal[i + 1].value.minus(nominal[i].value)),
      ).toBe(true);
    });
  });

  it("shows a future development buy as its value less the undrawn tranches, then each tranche", () => {
    const [y1, y2, y3, y4] = equityBridge(lenses(futureDev).nominal);
    expect(y1.purchases.toString()).toBe("7000000");
    expect(y1.drawdown.toString()).toBe("-2000000");
    expect(y2.purchases.toString()).toBe("1500000");
    expect(y2.drawdown.toString()).toBe("-1500000");
    expect(y3.purchases.toString()).toBe("1000000");
    expect(y3.drawdown.toString()).toBe("-1000000");
    expect(y4.purchases.toString()).toBe("0");
    expect(y4.drawdown.isZero()).toBe(true);
  });
});
