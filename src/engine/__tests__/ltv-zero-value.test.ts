// ADR 0133 (#129 item 5): LTV and yields divide by the value. With no value there is no
// ratio: LTV is null when debt is owed (0 when nothing is owed either), the yields are
// null. They used to read 0 — the best LTV band for the worst state.
import { describe, it, expect } from "vitest";
import {
  ltvOf,
  portfolioSnapshot,
  propertySnapshot,
  yieldOf,
} from "../metrics";
import { portfolioProjection, propertyProjection } from "../projections";
import {
  portfolioSnapshotAtYear,
  propertySnapshotAtYear,
  realPortfolioSnapshot,
  realProjection,
} from "../real";
import { applyScenario } from "../scenarios";
import { schedulesByProperty } from "../schedule";
import { money, rate } from "../brands";
import { D, ZERO } from "../../lib/money";
import { at } from "../arrays";
import type { Portfolio, Property } from "../types";
import { BASE_DATE, assumptions, portfolio } from "./support/seed";

// A 100 % value crash at the start (ADR 0038 allows it): every value is 0.
const crashed = applyScenario(assumptions, {
  valueShock: { pct: rate("1"), atYear: 0 },
});

const property = (id: string): Property => {
  const p = portfolio.properties.find((x) => x.id === id);
  if (!p) throw new Error(id);
  return p;
};

/** The seed with a 0 Kč valuation in force at baseDate for `ids`. */
function valuedAtZero(ids: string[], p: Portfolio = portfolio): Portfolio {
  return {
    ...p,
    valuations: [
      ...p.valuations,
      ...ids.map((id) => ({
        id: `v0-${id}`,
        propertyId: id,
        validFrom: BASE_DATE,
        marketValue: money("0"),
      })),
    ],
  };
}

describe("ltvOf / yieldOf", () => {
  it("divide by a positive value", () => {
    expect(ltvOf(D(30), D(100))?.toString()).toBe("0.3");
    expect(yieldOf(D(5), D(100))?.toString()).toBe("0.05");
  });

  it("LTV is null with debt and no value, 0 with neither", () => {
    expect(ltvOf(D(1), ZERO)).toBeNull();
    expect(ltvOf(ZERO, ZERO)?.toString()).toBe("0");
  });

  it("a yield is null with no value, whatever the income", () => {
    expect(yieldOf(D(1000), ZERO)).toBeNull();
    expect(yieldOf(ZERO, ZERO)).toBeNull();
  });
});

describe("ADR 0133: 100 % value crash at the start", () => {
  const rows = portfolioProjection(portfolio, crashed);

  it("every year's LTV is null while debt is owed, 0 once it is repaid", () => {
    const owing = rows.filter((y) => y.balance.greaterThan(ZERO));
    const repaid = rows.filter((y) => y.balance.isZero());
    // The seed owes 9.5 M Kč at Today and is debt-free from 2052: both kinds occur.
    expect(owing.length).toBeGreaterThan(0);
    expect(repaid.length).toBeGreaterThan(0);
    for (const y of rows) expect(y.value.isZero(), `Y${y.year}`).toBe(true);
    for (const y of owing) expect(y.ltv, `Y${y.year}`).toBeNull();
    for (const y of repaid) expect(y.ltv?.toString(), `Y${y.year}`).toBe("0");
  });

  it("a property projection follows the same rule", () => {
    const javorova = property("javorova");
    const schedules = schedulesByProperty(
      portfolio.mortgages,
      [javorova.id],
      crashed,
    );
    const y0 = at(
      propertyProjection(
        javorova,
        portfolio,
        crashed,
        schedules.get(javorova.id) ?? [],
      ),
      0,
    );
    expect(y0.balance.greaterThan(ZERO)).toBe(true);
    expect(y0.ltv).toBeNull();
  });

  it("the snapshot read off a crashed year has no LTV and no yields", () => {
    const y5 = at(rows, 5);
    expect(y5.noi.greaterThan(ZERO)).toBe(true);
    const s = portfolioSnapshotAtYear(
      portfolioSnapshot(portfolio, crashed),
      y5,
    );
    expect(s.ltv).toBeNull();
    expect(s.grossYield).toBeNull();
    expect(s.netYield).toBeNull();

    const p = propertySnapshotAtYear(
      propertySnapshot(property("javorova"), portfolio, crashed),
      y5,
    );
    expect(p.ltv).toBeNull();
    expect(p.grossYield).toBeNull();
    expect(p.netYield).toBeNull();
  });

  it("the real lens keeps the nulls", () => {
    const cpi = rows.map(() => D("1.5"));
    expect(at(realProjection(rows, cpi), 0).ltv).toBeNull();
    const s = portfolioSnapshotAtYear(
      portfolioSnapshot(portfolio, crashed),
      at(rows, 5),
    );
    const real = realPortfolioSnapshot(s, D("1.5"));
    expect(real.ltv).toBeNull();
    expect(real.grossYield).toBeNull();
    expect(real.netYield).toBeNull();
  });
});

describe("ADR 0133: a 0 Kč valuation", () => {
  it("one property at 0 with debt: its LTV and yields are null, the totals are not", () => {
    const p = valuedAtZero(["javorova"]);
    const s = propertySnapshot(property("javorova"), p, assumptions);
    expect(s.value.isZero()).toBe(true);
    expect(s.debt.greaterThan(ZERO)).toBe(true);
    expect(s.ltv).toBeNull();
    expect(s.grossYield).toBeNull();
    expect(s.netYield).toBeNull();

    const total = portfolioSnapshot(p, assumptions);
    expect(total.totalValue.greaterThan(ZERO)).toBe(true);
    expect(total.ltv?.greaterThan(ZERO)).toBe(true);
    expect(total.grossYield?.greaterThan(ZERO)).toBe(true);
  });

  it("every property at 0: the portfolio LTV and yields are null", () => {
    const p = valuedAtZero(portfolio.properties.map((x) => x.id));
    const total = portfolioSnapshot(p, assumptions);
    expect(total.totalValue.isZero()).toBe(true);
    expect(total.ltv).toBeNull();
    expect(total.grossYield).toBeNull();
    expect(total.netYield).toBeNull();
  });

  it("no value and no debt: LTV 0, yields null", () => {
    const debtFree: Portfolio = {
      ...portfolio,
      mortgages: portfolio.mortgages.filter((m) => m.propertyId !== "javorova"),
    };
    const s = propertySnapshot(
      property("javorova"),
      valuedAtZero(["javorova"], debtFree),
      assumptions,
    );
    expect(s.debt.isZero()).toBe(true);
    expect(s.ltv?.toString()).toBe("0");
    expect(s.grossYield).toBeNull();
    expect(s.netYield).toBeNull();
  });
});
