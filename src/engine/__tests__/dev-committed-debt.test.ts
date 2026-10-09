// Development property under construction (ADR 0166, #120): the value is the completed
// value, and the debt counts the whole scheduled loan as committed — the drawn balance
// plus the tranches not drawn yet. Interest and payments stay on the drawn balance (the
// schedule is unchanged), so a tranche draw moves debt from undrawn to drawn and creates
// no equity. Non-dev properties are untouched (the seed parity tests elsewhere stay
// green); here we pin the dev behaviour and the snapshot↔projection invariant.
import { describe, it, expect } from "vitest";
import { portfolioSnapshot, propertySnapshot } from "../metrics";
import { portfolioProjection, propertyProjection } from "../projections";
import { portfolioKpis } from "../kpis";
import { buildSchedule, propertySchedule } from "../schedule";
import { isoDate, edate } from "../dates";
import { assumptions } from "./support/seed";
import { devBlock as mixedDevBlock, mixed } from "./support/mixed";
import type { MortgageBlock, Portfolio, Property } from "../types";
import { near, KC } from "./support/tolerance";
import { rate } from "../brands";
import { money } from "../brands";

// initial 2.25M + draws 2.30M + 4.00M + 0.70M = 9.25M total principal.
const devBlock: MortgageBlock = {
  id: "m-dev",
  propertyId: "dev",
  startDate: isoDate("2026-06-01"), // on/before baseDate 2026-06-07 → initial drawn
  initialPrincipal: money("2250000"),
  fixationYears: 10,
  interestRatePa: rate("0.05"),
  monthlyInstalment: money("12000"),
  loanTermYears: 30,
  draws: [
    { date: isoDate("2026-09-01"), amount: money("2300000") },
    { date: isoDate("2028-04-05"), amount: money("4000000") },
    { date: isoDate("2028-10-10"), amount: money("700000") },
  ],
  completionDate: isoDate("2028-10-10"),
};
const TOTAL = 9_250_000;
const COMPLETED = 12_000_000;

const property: Property = {
  id: "dev",
  name: "Dev unit",
  purchaseDate: isoDate("2025-01-01"), // owned at baseDate
  purchasePrice: money("8000000"),
};

function portfolioWith(block: MortgageBlock): Portfolio {
  return {
    properties: [property],
    mortgages: [block],
    valuations: [
      {
        id: "v",
        propertyId: "dev",
        validFrom: isoDate("2026-06-01"),
        marketValue: money("12000000"),
      },
    ],
    leases: [
      {
        id: "l",
        propertyId: "dev",
        startDate: isoDate("2025-01-01"),
        monthlyRent: money("20000"),
      },
    ],
    holdingCosts: [],
  };
}

/** The mixed fixture's dev flat on its own: properties, loans, values, leases. */
function mixedDevOnly(blocks: MortgageBlock[]): Portfolio {
  const only = <T extends { propertyId: string }>(rows: T[]) =>
    rows.filter((r) => r.propertyId === "dev");
  return {
    properties: mixed.properties.filter((p) => p.id === "dev"),
    mortgages: blocks,
    valuations: only(mixed.valuations),
    leases: only(mixed.leases),
    holdingCosts: [],
  };
}

describe("snapshot: value = completed value, debt = committed (ADR 0166)", () => {
  const pf = portfolioWith(devBlock);
  const schedule = buildSchedule(devBlock, assumptions);

  it("at baseDate the value is the full completed value and the undrawn tranches are committed debt", () => {
    const s = propertySnapshot(
      property,
      pf,
      assumptions,
      assumptions.baseDate,
      schedule,
    );
    expect(s.value.toString()).toBe(String(COMPLETED));
    // Drawn debt stays the schedule balance: only the initial 2.25M is drawn.
    near(s.debt.toNumber(), 2_250_000, KC, "drawn debt");
    near(s.committedDebt.toNumber(), TOTAL, KC, "committed debt");
    near(s.equity.toNumber(), COMPLETED - TOTAL, KC, "equity = V − committed");
    // LTV is what the ramp gave: total loan ÷ completed value.
    near(s.ltv!.toNumber(), TOTAL / COMPLETED, 1e-9, "ltv");
  });

  it("a tranche drawn between grid dates counts as drawn only on the schedule's grid", () => {
    // 2026-09-01 lands in grid month 3 (2026-09-07). On 2026-09-05 the snapshot reads
    // grid month 2, whose balance does not hold the tranche yet, so it is still undrawn.
    const s = propertySnapshot(
      property,
      pf,
      assumptions,
      isoDate("2026-09-05"),
      schedule,
    );
    near(s.debt.toNumber(), 2_250_000, KC, "drawn debt");
    near(s.committedDebt.toNumber(), TOTAL, KC, "committed debt");
  });

  it("after the last draw committed debt is the drawn balance", () => {
    const s = propertySnapshot(
      property,
      pf,
      assumptions,
      isoDate("2029-06-07"),
      schedule,
    );
    expect(s.committedDebt.toString()).toBe(s.debt.toString());
  });

  it("portfolio totals: equity and LTV from committed debt, weighted rate from drawn debt", () => {
    const s = portfolioSnapshot(pf, assumptions);
    near(s.totalDebt.toNumber(), 2_250_000, KC, "drawn total");
    near(s.totalCommittedDebt.toNumber(), TOTAL, KC, "committed total");
    near(s.totalEquity.toNumber(), COMPLETED - TOTAL, KC, "total equity");
    near(s.ltv!.toNumber(), TOTAL / COMPLETED, 1e-9, "ltv");
    near(s.weightedAvgRate!.toNumber(), 0.05, 1e-9, "weighted rate");
  });
});

describe("projection: draws move debt from undrawn to drawn and create no equity", () => {
  const pf = portfolioWith(devBlock);
  const schedule = propertySchedule([devBlock], assumptions);
  const proj = propertyProjection(property, pf, assumptions, schedule);

  it("during interest-only construction committed debt stays at the total loan", () => {
    // Year 0: 7.0M undrawn; year 1: 4.7M undrawn (after 2026-09-01); year 2: 0.7M.
    const undrawn = [7_000_000, 4_700_000, 700_000];
    for (const n of [0, 1, 2]) {
      near(proj[n].committedDebt.toNumber(), TOTAL, KC, `year ${n} committed`);
      near(
        proj[n].committedDebt.minus(proj[n].balance).toNumber(),
        undrawn[n],
        KC,
        `year ${n} undrawn`,
      );
    }
    // Completed and amortizing: nothing is undrawn.
    expect(proj[3].committedDebt.toString()).toBe(proj[3].balance.toString());
  });

  it("each year's equity = value − committed debt, so a draw year's equity change is the value change", () => {
    for (let n = 0; n <= assumptions.horizonYears; n++) {
      const y = proj[n];
      near(y.equity, y.value.minus(y.committedDebt).toNumber(), KC, `N=${n}`);
      const ltv = y.value.isZero() ? null : y.committedDebt.div(y.value);
      near(y.ltv!, ltv!.toNumber(), 1e-12, `ltv N=${n}`);
    }
    near(
      proj[1].equity.minus(proj[0].equity),
      proj[1].value.minus(proj[0].value).toNumber(),
      KC,
      "year 1 Δequity",
    );
  });

  it("the value is the completed value from year 0 (no construction ramp)", () => {
    const plain = portfolioWith({
      ...devBlock,
      draws: undefined,
      completionDate: undefined,
    });
    const plainProj = propertyProjection(
      property,
      plain,
      assumptions,
      propertySchedule(plain.mortgages, assumptions),
    );
    for (let n = 0; n <= assumptions.horizonYears; n++) {
      expect(proj[n].value.toString()).toBe(plainProj[n].value.toString());
    }
  });
});

describe("snapshot ↔ projection consistency (the invariant anchor)", () => {
  const pf = portfolioWith(devBlock);
  const schedule = propertySchedule([devBlock], assumptions);
  const proj = propertyProjection(property, pf, assumptions, schedule);

  it("propertySnapshot(baseDate+N·12mo) == projection year N across the draw window", () => {
    for (const N of [0, 1, 2, 3, 5, 10]) {
      const asOf = edate(assumptions.baseDate, N * 12);
      const snap = propertySnapshot(
        property,
        pf,
        assumptions,
        asOf,
        schedule.rows,
      );
      near(snap.value, proj[N].value.toNumber(), KC, `year ${N} value`);
      near(snap.debt, proj[N].balance.toNumber(), KC, `year ${N} drawn`);
      near(
        snap.committedDebt,
        proj[N].committedDebt.toNumber(),
        KC,
        `year ${N} committed`,
      );
      near(snap.equity, proj[N].equity.toNumber(), KC, `year ${N} equity`);
    }
  });
});

describe("probe R8-2: returns match the completed flat with the same debt (#120)", () => {
  const dev = mixedDevOnly([mixedDevBlock]);
  const plain = mixedDevOnly([
    {
      ...mixedDevBlock,
      initialPrincipal: money("4500000"),
      draws: undefined,
      completionDate: undefined,
    },
  ]);

  it("year-0 equity is completed value − whole loan, not the drawn share of it", () => {
    const y0 = portfolioProjection(dev, assumptions)[0];
    near(y0.value, 9_500_000, KC, "value");
    near(y0.committedDebt, 4_500_000, KC, "committed");
    near(y0.equity, 5_000_000, KC, "equity (was 2,222,222 with the ramp)");
  });

  it("the multiple and levered IRR are about those of the completed flat", () => {
    const d = portfolioKpis(dev, assumptions);
    const p = portfolioKpis(plain, assumptions);
    // Before ADR 0166: 13.87x vs 6.14x and 8.75 % vs 6.10 %.
    const m = d.netWorthMultiple!.div(p.netWorthMultiple!).toNumber();
    expect(Math.abs(m - 1)).toBeLessThan(0.02);
    near(
      d.leveredIrrNominal!,
      p.leveredIrrNominal!.toNumber(),
      0.001,
      "levered IRR",
    );
  });
});

describe("committed debt edge cases", () => {
  it("an owned flat whose development loan starts after baseDate owes the whole loan as committed", () => {
    const late: MortgageBlock = {
      ...devBlock,
      startDate: isoDate("2026-09-01"),
      draws: [
        { date: isoDate("2027-01-15"), amount: money("3000000") },
        { date: isoDate("2027-09-01"), amount: money("4000000") },
      ],
      completionDate: isoDate("2027-09-01"),
    };
    const pf = portfolioWith(late);
    const y0 = portfolioProjection(pf, assumptions)[0];
    near(y0.balance, 0, KC, "nothing drawn at baseDate");
    near(y0.committedDebt, 2_250_000 + 7_000_000, KC, "committed");
    near(y0.value, COMPLETED, KC, "value");
    const s = portfolioSnapshot(pf, assumptions);
    near(s.totalCommittedDebt, 9_250_000, KC, "snapshot committed");
  });

  it("tranches of a development loan replaced by a successor are not committed after the handover", () => {
    const refi: MortgageBlock = {
      id: "m-refi",
      propertyId: "dev",
      startDate: isoDate("2027-01-01"),
      initialPrincipal: money("3500000"),
      fixationYears: 5,
      interestRatePa: rate("0.045"),
      monthlyInstalment: money("20000"),
    };
    const pf = mixedDevOnly([mixedDevBlock, refi]);
    const proj = portfolioProjection(pf, assumptions);
    // Year 0: the 1.5M tranche of 2026-11-15 is still ahead; the 1.0M one of 2027-08-20
    // is dated after the successor starts, so it is never drawn and not committed.
    near(proj[0].committedDebt.minus(proj[0].balance), 1_500_000, KC, "year 0");
    // Year 1 (2027-06-07): the successor runs; the 2027-08-20 tranche never comes.
    for (const n of [1, 2, 5]) {
      expect(proj[n].committedDebt.toString()).toBe(proj[n].balance.toString());
    }
  });

  it("a future purchase owes nothing before it turns on and comes online at its full value", () => {
    const futureDev: MortgageBlock = {
      ...mixedDevBlock,
      startDate: isoDate("2027-03-01"),
      loanTermYears: 30,
      draws: [
        { date: isoDate("2027-11-15"), amount: money("1500000") },
        { date: isoDate("2028-08-20"), amount: money("1000000") },
      ],
      completionDate: isoDate("2028-08-20"),
    };
    const pf: Portfolio = {
      ...mixedDevOnly([futureDev]),
      properties: [
        {
          id: "dev",
          name: "Dev unit",
          purchaseDate: isoDate("2027-03-01"),
          purchasePrice: money("7000000"),
        },
      ],
      valuations: [
        {
          id: "v-dev",
          propertyId: "dev",
          validFrom: isoDate("2027-03-01"),
          marketValue: money("9500000"),
        },
      ],
    };
    const proj = portfolioProjection(pf, assumptions);
    near(proj[0].committedDebt, 0, KC, "year 0 committed");
    near(proj[0].equity, 0, KC, "year 0 equity");
    near(
      portfolioSnapshot(pf, assumptions).totalCommittedDebt,
      0,
      KC,
      "pending snapshot",
    );
    // Turn-on year: the whole flat comes in, with the whole loan committed.
    near(proj[1].acquiredValue, 9_500_000, KC, "acquired value");
    near(proj[1].committedDebt, 4_500_000, KC, "year 1 committed");
    near(
      proj[1].committedDebt.minus(proj[1].balance),
      2_500_000, // both tranches are dated after 2027-06-07
      KC,
      "year 1 undrawn",
    );
  });

  it("a plain loan has no committed part beyond its balance", () => {
    const plain = { ...devBlock, draws: undefined, completionDate: undefined };
    const proj = portfolioProjection(portfolioWith(plain), assumptions);
    for (const y of proj) {
      expect(y.committedDebt.toString()).toBe(y.balance.toString());
    }
  });
});

describe("portfolio KPIs on a development property", () => {
  it("does not produce NaN CAGR when the completed value is below the total principal", () => {
    // completed 5M < total principal 9.25M ⇒ equity0 is negative during construction.
    const pf = portfolioWith(devBlock);
    pf.valuations[0].marketValue = money("5000000");
    const kpis = portfolioKpis(pf, assumptions);
    expect(kpis.netWorthMultiple).toBeNull(); // equity0 ≤ 0 (ADR 0126)
    expect(kpis.cagrNominal).toBeNull(); // non-positive equity0 → null, not NaN (D-34)
    expect(kpis.cagrReal).toBeNull();
  });
});

describe("committedDraws explains the committed-debt move (ADR 0166)", () => {
  const cases: [string, Portfolio][] = [
    ["mixed", mixed],
    ["dev flat", portfolioWith(devBlock)],
  ];
  it.each(cases)(
    "%s: committed[t] = committed[t−1] − principal − prepaid + committedDraws + refinanced",
    (_, pf) => {
      const proj = portfolioProjection(pf, assumptions);
      expect(proj[0].committedDraws.isZero()).toBe(true);
      for (let t = 1; t < proj.length; t++) {
        const y = proj[t];
        near(
          y.committedDebt,
          proj[t - 1].committedDebt
            .minus(y.principal)
            .minus(y.prepaid)
            .plus(y.committedDraws)
            .plus(y.refinanced)
            .toNumber(),
          KC,
          `t=${t}`,
        );
      }
    },
  );

  it("a tranche year commits nothing new", () => {
    const proj = portfolioProjection(portfolioWith(devBlock), assumptions);
    expect(proj[1].draws.greaterThan(0)).toBe(true);
    near(proj[1].committedDraws, 0, KC, "year 1");
    near(proj[2].committedDraws, 0, KC, "year 2");
  });
});
