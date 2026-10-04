// As-of-date snapshot: the dashboard/property view evaluated at an arbitrary date
// (today or future). Value is modeled (valuation grown by appreciation, re-anchoring
// on newer valuations); debt/rent/costs are effective-dated actuals. At baseDate
// everything collapses to the parity targets (regression). See the parity targets in .claude/rules/engine-parity.md.
import { describe, it, expect } from "vitest";
import { powYears } from "../../lib/money";
import { edate, isoDate } from "../dates";
import { portfolioSnapshot, propertySnapshot } from "../metrics";
import { portfolioProjection, propertyProjection } from "../projections";
import { currentBalance } from "../amortization";
import { schedulesByProperty } from "../schedule";
import { assumptions, portfolio } from "./support/seed";
import type { MortgageBlock, Portfolio } from "../types";
import { devBlock } from "./support/mixed";
import { KC, RATIO, near } from "./support/tolerance";
import { money } from "../brands";

const schedules = schedulesByProperty(
  portfolio.mortgages,
  portfolio.properties.map((p) => p.id),
  assumptions,
);
const atYears = (n: number) => edate(assumptions.baseDate, n * 12);

describe("powYears", () => {
  it("(1.04)^0 = 1", () => near(powYears(1.04, 0).toNumber(), 1, RATIO, "^0"));
  it("(1.04)^1 = 1.04", () =>
    near(powYears(1.04, 1).toNumber(), 1.04, RATIO, "^1"));
  it("(1.04)^(6/12) = sqrt(1.04)", () =>
    near(powYears(1.04, 6 / 12).toNumber(), Math.sqrt(1.04), RATIO, "^0.5"));
});

describe("Parity: snapshot at baseDate+N == projection year N (value + debt)", () => {
  const proj = portfolioProjection(portfolio, assumptions);
  for (const n of [0, 1, 5, 10]) {
    const snap = portfolioSnapshot(
      portfolio,
      assumptions,
      atYears(n),
      schedules,
    );
    it(`year ${n} total value`, () =>
      near(
        snap.totalValue.toNumber(),
        proj[n].value.toNumber(),
        KC,
        `value y${n}`,
      ));
    it(`year ${n} total debt`, () =>
      near(
        snap.totalDebt.toNumber(),
        proj[n].balance.toNumber(),
        KC,
        `debt y${n}`,
      ));
  }
});

describe("Regression: snapshot at baseDate == the parity targets", () => {
  const snap = portfolioSnapshot(
    portfolio,
    assumptions,
    assumptions.baseDate,
    schedules,
  );
  it("total value 28,730,000", () =>
    near(snap.totalValue.toNumber(), 28_730_000, KC, "value"));
  it("total debt 9,515,405.13", () =>
    near(snap.totalDebt.toNumber(), 9_515_405.13, KC, "debt"));
  it("net cash flow -57,334.2", () =>
    near(snap.netCashFlow.toNumber(), -57_334.2, KC, "ncf"));
  it("DSCR 0.9113", () => near(snap.dscr!.toNumber(), 0.9113, RATIO, "dscr"));
});

describe("DR-118: an omitted schedule is built from the same inputs", () => {
  // The snapshot always reads the schedule: a caller that passes none gets the rows the
  // app passes. Year 5 is past Lipova's 2029 fixation reset.
  for (const n of [0, 1, 5, 10]) {
    it(`portfolio snapshot at year ${n}`, () =>
      expect(portfolioSnapshot(portfolio, assumptions, atYears(n))).toEqual(
        portfolioSnapshot(portfolio, assumptions, atYears(n), schedules),
      ));
  }

  it("property snapshot after a past prepayment", () => {
    const javorova = portfolio.properties.find((p) => p.id === "javorova");
    if (!javorova) throw new Error("seed property missing");
    const prepaid: Portfolio = {
      ...portfolio,
      mortgages: portfolio.mortgages.map((m) =>
        m.propertyId === "javorova"
          ? {
              ...m,
              prepayments: [
                {
                  date: isoDate("2024-01-20"),
                  amount: money(200000),
                  effect: "lowerInstalment" as const,
                },
              ],
            }
          : m,
      ),
    };
    const rows = schedulesByProperty(
      prepaid.mortgages,
      ["javorova"],
      assumptions,
    ).get("javorova");
    expect(propertySnapshot(javorova, prepaid, assumptions)).toEqual(
      propertySnapshot(
        javorova,
        prepaid,
        assumptions,
        assumptions.baseDate,
        rows,
      ),
    );
  });
});

describe("Valuation re-anchor: a newer valuation overrides the modeled curve", () => {
  const reval: Portfolio = {
    ...portfolio,
    valuations: [
      ...portfolio.valuations,
      // Fresh valuation for Javorova, dated well after baseDate.
      {
        id: "v-petr-2030",
        propertyId: "javorova",
        validFrom: edate(assumptions.baseDate, 4 * 12), // 2030-06-07
        marketValue: money("20000000"),
      },
    ],
  };
  const sch = schedulesByProperty(
    reval.mortgages,
    reval.properties.map((p) => p.id),
    assumptions,
  );

  it("snapshot exactly on the new valuation date uses it (no growth yet)", () => {
    const snap = portfolioSnapshot(reval, assumptions, atYears(4), sch);
    const petr = snap.perProperty.find((p) => p.propertyId === "javorova")!;
    near(petr.value.toNumber(), 20_000_000, KC, "reanchored value");
  });

  it("projection re-anchors from the new valuation's turn-on year", () => {
    const proj = propertyProjection(
      reval.properties.find((p) => p.id === "javorova")!,
      reval,
      assumptions,
      sch.get("javorova") ?? [],
    );
    near(proj[4].value.toNumber(), 20_000_000, KC, "proj y4 = new valuation");
    near(
      proj[5].value.toNumber(),
      20_000_000 * 1.04,
      KC,
      "proj y5 grows from it",
    );
  });

  it("years before the new valuation keep the original baseDate curve", () => {
    const proj = propertyProjection(
      reval.properties.find((p) => p.id === "javorova")!,
      reval,
      assumptions,
      sch.get("javorova") ?? [],
    );
    near(
      proj[3].value.toNumber(),
      10_200_000 * Math.pow(1.04, 3),
      KC,
      "proj y3 unchanged",
    );
  });
});

describe("baseDate predates the first valuation (the user's real shape)", () => {
  // baseDate end-2025; the only valuation is dated ~3 months later. The projection
  // year 0 and the snapshot must use the valuation (12M), NOT the 2015 purchase
  // price (4.8M) — and there must be no year-0→1 jump.
  const baseDate = isoDate("2025-12-31");
  const a = { ...assumptions, baseDate };
  const prop = {
    id: "p1",
    name: "Flat",
    type: "1 bedroom",
    sizeM2: 50,
    purchaseDate: isoDate("2015-06-01"),
    purchasePrice: money("4080000"),
  };
  const pf: Portfolio = {
    properties: [prop],
    mortgages: [],
    valuations: [
      {
        id: "v1",
        propertyId: "p1",
        validFrom: isoDate("2026-03-01"),
        marketValue: money("10200000"),
      },
    ],
    leases: [],
    holdingCosts: [],
  };
  const proj = propertyProjection(prop, pf, a, []);

  it("projection year 0 uses the valuation, not the purchase price", () =>
    near(proj[0].value.toNumber(), 10_200_000, KC, "y0"));
  it("no year-0 → year-1 jump (within one year's appreciation)", () =>
    expect(proj[1].value.toNumber() / proj[0].value.toNumber()).toBeLessThan(
      1.05,
    ));
  it("snapshot at baseDate uses the valuation too", () => {
    const snap = portfolioSnapshot(pf, a, baseDate);
    near(snap.totalValue.toNumber(), 10_200_000, KC, "snap@base");
  });
  it("snapshot after the valuation date grows from it", () => {
    const snap = portfolioSnapshot(pf, a, isoDate("2027-03-01"));
    near(
      snap.totalValue.toNumber(),
      10_200_000 * 1.04,
      KC,
      "snap +1y from valuation",
    );
  });
});

describe("Fixation-aware debt at a future as-of date (Javorova resets 2031)", () => {
  // 6 years out (~2032) is past the fixation end → schedule (reset to 4.5%, re-amortized)
  // diverges from the naive currentBalance (original rate, never reset).
  const asOf = atYears(6);
  const withSchedule = portfolioSnapshot(
    portfolio,
    assumptions,
    asOf,
    schedules,
  ).perProperty.find((p) => p.propertyId === "javorova")!.debt;
  // The seed's only Javorova block.
  const block = portfolio.mortgages.find((b) => b.propertyId === "javorova")!;
  const naive = currentBalance(block, asOf);
  it("schedule-based debt differs from naive currentBalance", () => {
    expect(
      Math.abs(withSchedule.toNumber() - naive.toNumber()),
    ).toBeGreaterThan(1);
  });
});

describe("ADR 0116: the instalment after a month's prepayment", () => {
  // A lowerInstalment prepayment settles after that month's payment, so the balance at
  // an as-of date in that month is already lower; the instalment must match it.
  const javorova = portfolio.properties.find((p) => p.id === "javorova");
  if (!javorova) throw new Error("seed property missing");
  const withPrepayment: Portfolio = {
    ...portfolio,
    mortgages: portfolio.mortgages.map((m) =>
      m.propertyId === "javorova"
        ? {
            ...m,
            prepayments: [
              {
                date: isoDate("2029-03-20"),
                amount: money(300000),
                effect: "lowerInstalment" as const,
              },
            ],
          }
        : m,
    ),
  };
  const rows =
    schedulesByProperty(
      withPrepayment.mortgages,
      ["javorova"],
      assumptions,
    ).get("javorova") ?? [];
  const i = rows.findIndex((r) => r.prepaid.greaterThan(0));
  const on = (k: number) =>
    propertySnapshot(
      javorova,
      withPrepayment,
      assumptions,
      isoDate(rows[k].date.toISOString().slice(0, 10)),
      rows,
    );

  it("reports the lowered instalment in the prepayment month", () => {
    const snap = on(i);
    expect(rows[i + 1].instalment.lessThan(rows[i].instalment)).toBe(true);
    expect(snap.debt.toFixed(6)).toBe(rows[i].endBalance.toFixed(6));
    expect(snap.annualDebtService.toFixed(6)).toBe(
      rows[i + 1].instalment.times(12).toFixed(6),
    );
  });

  it("keeps the month's own instalment when the next row draws a tranche", () => {
    // Dev loan: a prepayment in the interest-only month before the 2027-08-20
    // tranche; the next row's instalment is sized on the drawn balance.
    const dev = {
      ...devBlock,
      id: "m-dev",
      propertyId: "javorova",
      prepayments: [
        {
          date: isoDate("2027-07-15"),
          amount: money(200000),
          effect: "lowerInstalment" as const,
        },
      ],
    } as MortgageBlock;
    const p: Portfolio = {
      ...portfolio,
      mortgages: [
        ...portfolio.mortgages.filter((m) => m.propertyId !== "javorova"),
        dev,
      ],
    };
    const devRows =
      schedulesByProperty(p.mortgages, ["javorova"], assumptions).get(
        "javorova",
      ) ?? [];
    const k = devRows.findIndex((r) => r.prepaid.greaterThan(0));
    expect(devRows[k + 1].drawn.greaterThan(0)).toBe(true);
    const snap = propertySnapshot(
      javorova,
      p,
      assumptions,
      isoDate(devRows[k].date.toISOString().slice(0, 10)),
      devRows,
    );
    expect(snap.annualDebtService.toFixed(6)).toBe(
      devRows[k].instalment.times(12).toFixed(6),
    );
  });

  it("keeps the month's own instalment the month before", () => {
    expect(on(i - 1).annualDebtService.toFixed(6)).toBe(
      rows[i - 1].instalment.times(12).toFixed(6),
    );
  });
});
