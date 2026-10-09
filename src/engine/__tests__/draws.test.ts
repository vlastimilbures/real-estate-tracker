// DR-092: the schedule kernel records the new debt each row draws, and the projection
// carries it per year as `draws`. Until now ui/model backed draws out of the balances
// (balance[t] − balance[t−1] + principal[t]); the engine value must reproduce that
// back-out exactly (a refactor: no number moves), and every schedule row must satisfy
//   endBalance[m] = endBalance[m−1] − principal[m] + drawn[m] + refinanced[m],
// anchored at the baseDate debt (openingDebt), over plain, development, future, refinance
// and turn-on cases. Since ADR 0130 a refinance handover's difference is `refinanced`,
// apart from `drawn` / `draws`, so the back-out is draws + refinanced.
import { describe, it, expect } from "vitest";
import { D, ZERO, type Decimal } from "../../lib/money";
import { rate } from "../brands";
import { isoDate } from "../dates";
import { applyScenario } from "../scenarios";
import { openingDebt, propertySchedule } from "../schedule";
import { scheduledPrincipal } from "../growth";
import { portfolioProjection, propertyProjection } from "../projections";
import type {
  Assumptions,
  MortgageBlock,
  Portfolio,
  ProjectionYear,
} from "../types";
import { assumptions, portfolio } from "./support/seed";
import { devBlock, mixed } from "./support/mixed";
import { money } from "../brands";

const EPS = D("1e-12");

const base = (b: Partial<MortgageBlock>): MortgageBlock =>
  ({
    id: "x",
    propertyId: "javorova",
    startDate: isoDate("2021-01-31"),
    initialPrincipal: money("3000000"),
    fixationYears: 3,
    interestRatePa: rate("0.029"),
    monthlyInstalment: money("15000"),
    ...b,
  }) as MortgageBlock;

/** Loans covering each schedule branch (the golden master's edge loans). */
const edgeLoans: Record<string, MortgageBlock> = {
  monthEndPastFixation: base({}),
  zeroRate: base({
    interestRatePa: rate("0"),
    monthlyInstalment: money("20000"),
  }),
  explicitTerm: base({ loanTermYears: 25, monthlyInstalment: money("9000") }),
  firstGridMonth: base({ startDate: isoDate("2026-06-20") }),
  futureMonthEnd: base({ startDate: isoDate("2027-01-31"), fixationYears: 5 }),
  devRunning: { ...devBlock, propertyId: "javorova" },
  devFuture: base({
    startDate: isoDate("2026-09-01"),
    fixationYears: 10,
    interestRatePa: rate("0.05"),
    loanTermYears: 30,
    draws: [
      { date: isoDate("2026-09-05"), amount: money("250000") }, // D-46: first-draw month
      { date: isoDate("2027-03-01"), amount: money("1500000") },
      { date: isoDate("2027-09-01"), amount: money("2000000") },
    ],
    completionDate: isoDate("2027-12-01"),
  }),
  devDrawsOnly: base({
    startDate: isoDate("2025-02-28"),
    loanTermYears: 20,
    draws: [
      { date: isoDate("2025-10-31"), amount: money("500000") },
      { date: isoDate("2026-07-15"), amount: money("700000") },
      { date: isoDate("2026-07-20"), amount: money("100000") },
    ],
  }),
  devIoPastCompletion: base({
    startDate: isoDate("2023-04-10"),
    loanTermYears: 30,
    completionDate: isoDate("2025-12-31"),
  }),
  // D-41: a tranche after the last payment due and on/before baseDate lands in grid
  // month 1 but is opening (baseDate) debt, not a year-1 draw.
  trancheBeforeBase: base({
    startDate: isoDate("2026-05-20"),
    loanTermYears: 30,
    draws: [{ date: isoDate("2026-06-01"), amount: money("400000") }],
  }),
};

const swapped = (blocks: MortgageBlock[]): Portfolio => ({
  ...portfolio,
  mortgages: [
    ...portfolio.mortgages.filter((m) => m.propertyId !== "javorova"),
    ...blocks,
  ],
});

/** Seed with successors after baseDate: a refix and a cash-out refinance (D-27, D-47). */
const refinanced: Portfolio = {
  ...portfolio,
  mortgages: [
    ...portfolio.mortgages,
    base({
      id: "refi-p",
      startDate: isoDate("2031-01-17"),
      initialPrincipal: money("1633000"),
      fixationYears: 5,
      interestRatePa: rate("0.039"),
      monthlyInstalment: money("9800"),
    }),
    base({
      id: "refi-w",
      propertyId: "lipova",
      startDate: isoDate("2029-01-15"),
      initialPrincipal: money("7000000"),
      fixationYears: 5,
      interestRatePa: rate("0.04"),
      monthlyInstalment: money("35000"),
    }),
  ],
};

/** A development loan refinanced on 2027-05-01, with a 500,000 tranche on `tranche`. */
const devRefinance = (tranche: string): MortgageBlock[] => [
  base({
    id: "dev",
    startDate: isoDate("2026-03-01"),
    initialPrincipal: money("1000000"),
    loanTermYears: 30,
    draws: [
      { date: isoDate("2026-12-01"), amount: money("300000") },
      { date: isoDate(tranche), amount: money("500000") },
    ],
    completionDate: isoDate("2027-04-30"),
  }),
  base({
    id: "refi",
    startDate: isoDate("2027-05-01"),
    initialPrincipal: money("2000000"),
    fixationYears: 5,
    interestRatePa: rate("0.045"),
    monthlyInstalment: money("11000"),
  }),
];

const CASES: [string, Portfolio, Assumptions][] = [
  ["seed", portfolio, assumptions],
  ["mixed", mixed, assumptions],
  ["refinanced", refinanced, assumptions],
  [
    "mixed, rate shock",
    mixed,
    applyScenario(assumptions, {
      rateShock: { deltaPa: rate("0.02"), durationYears: 2 },
    }),
  ],
  ...Object.entries(edgeLoans).map(
    ([name, b]): [string, Portfolio, Assumptions] => [
      name,
      swapped([b]),
      assumptions,
    ],
  ),
  [
    // Successor drawn in grid month 1 (d = 1) of a running loan.
    "successor in grid month 1",
    swapped([
      base({ id: "p1", startDate: isoDate("2021-01-17") }),
      base({
        id: "p2",
        startDate: isoDate("2026-06-20"),
        initialPrincipal: money("900000"),
      }),
    ]),
    assumptions,
  ],
  [
    // Development loan refinanced into a plain loan; a tranche in the refinance month
    // after the successor's start is dropped from the kept draw row (DR-126, ADR 0079).
    "development → refinance",
    swapped(devRefinance("2027-05-05")),
    assumptions,
  ],
  [
    // A loan running at baseDate on a property bought later: the debt arrives with the
    // property in its turn-on year.
    "loan predates purchase",
    {
      ...portfolio,
      properties: portfolio.properties.map((p) =>
        p.id === "javorova" ? { ...p, purchaseDate: isoDate("2028-09-01") } : p,
      ),
    },
    assumptions,
  ],
];

/** The old ui/model back-out, which the engine `draws` + `refinanced` must reproduce. */
const backOut = (proj: ProjectionYear[], t: number): Decimal =>
  proj[t].balance
    .minus(t > 0 ? proj[t - 1].balance : ZERO)
    .plus(proj[t].principal);

function expectDrawsMatchBackOut(proj: ProjectionYear[], label: string) {
  expect(proj[0].draws.isZero(), `${label} year 0`).toBe(true);
  expect(proj[0].refinanced.isZero(), `${label} year 0`).toBe(true);
  for (let t = 1; t < proj.length; t++) {
    const diff = proj[t].draws
      .plus(proj[t].refinanced)
      .minus(backOut(proj, t))
      .abs();
    expect(diff.lt(EPS), `${label} t=${t}: ${diff.toString()}`).toBe(true);
  }
}

describe("DR-092 — schedule rows record the debt they draw", () => {
  for (const [name, p, a] of CASES) {
    it(`${name}: endBalance[m] = endBalance[m−1] − principal[m] + drawn[m] + refinanced[m]`, () => {
      for (const prop of p.properties) {
        const blocks = p.mortgages.filter((m) => m.propertyId === prop.id);
        const { rows } = propertySchedule(blocks, a);
        let prev = rows.length > 0 ? openingDebt(blocks, a) : ZERO;
        for (const row of rows) {
          const diff = prev
            .minus(row.principal)
            .plus(row.drawn)
            .plus(row.refinanced)
            .minus(row.endBalance)
            .abs();
          expect(
            diff.lt(EPS),
            `${prop.id} m${row.month}: ${diff.toString()}`,
          ).toBe(true);
          prev = row.endBalance;
        }
      }
    });
  }

  it("a plain running loan draws nothing; a future loan draws its principal once", () => {
    const { rows } = propertySchedule([edgeLoans.futureMonthEnd], assumptions);
    const drawn = rows.filter((r) => !r.drawn.isZero());
    expect(drawn.map((r) => r.drawn.toString())).toEqual(["3000000"]);
    const seedRows = propertySchedule(
      portfolio.mortgages.filter((m) => m.propertyId === "javorova"),
      assumptions,
    ).rows;
    expect(seedRows.every((r) => r.drawn.isZero())).toBe(true);
  });
});

describe("DR-092 — ProjectionYear.draws + refinanced equals the balance back-out", () => {
  for (const [name, p, a] of CASES) {
    it(`${name}: per property and portfolio`, () => {
      const blocksOf = (id: string) =>
        p.mortgages.filter((m) => m.propertyId === id);
      for (const prop of p.properties.filter((x) => x.active !== false)) {
        const schedule = propertySchedule(blocksOf(prop.id), a);
        expectDrawsMatchBackOut(
          propertyProjection(prop, p, a, schedule),
          `${name}/${prop.id}`,
        );
      }
      expectDrawsMatchBackOut(portfolioProjection(p, a), `${name}/portfolio`);
    });
  }
});

describe("scheduledPrincipal", () => {
  it("is the initial principal plus every draw", () => {
    const block = {
      initialPrincipal: money("1000000"),
      draws: [
        { date: isoDate("2027-01-01"), amount: money("250000") },
        { date: isoDate("2028-01-01"), amount: money("0.5") },
      ],
    } as unknown as MortgageBlock;
    expect(scheduledPrincipal(block).toString()).toBe("1250000.5");
    expect(scheduledPrincipal({ ...block, draws: undefined }).toString()).toBe(
      "1000000",
    );
  });
});

describe("DR-126 — a tranche dated after the successor's start is dropped (ADR 0079)", () => {
  const paidOff = (tranche: string) =>
    propertySchedule(devRefinance(tranche), assumptions).refinances[0]!.paidOff;

  it("in the draw month (2027-05-05) as after it (2027-05-20): paid off 1,297,603.15", () => {
    // Was 1,796,681.29: the 05-05 tranche stayed in the kept draw row.
    expect(paidOff("2027-05-05").toFixed(2)).toBe(
      paidOff("2027-05-20").toFixed(2),
    );
    expect(paidOff("2027-05-20").toFixed(2)).toBe("1297603.15");
  });

  it("a tranche on the successor's start is still paid off", () => {
    expect(paidOff("2027-05-01").greaterThan(paidOff("2027-05-20"))).toBe(true);
  });
});
