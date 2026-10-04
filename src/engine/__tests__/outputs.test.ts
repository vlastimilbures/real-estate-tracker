// P9 (DR-042): `portfolioOutputs` and `projectionAndKpis` compute the loan schedules
// and the projection once and share them. They must return exactly what the separate
// public calls return (the old `useEngine` / `useScenarioComparison` bodies), and throw
// the same error first on invalid inputs.
import { describe, it, expect } from "vitest";
import { rate } from "../brands";
import { edate, isoDate } from "../dates";
import { propertySchedules, schedulesByProperty } from "../schedule";
import { portfolioSnapshot } from "../metrics";
import { portfolioProjection } from "../projections";
import { portfolioKpis } from "../kpis";
import { portfolioOutputs, projectionAndKpis } from "../outputs";
import { financingExposure } from "../financing";
import { applyScenario } from "../scenarios";
import { EngineInputError } from "../errors";
import type { Assumptions, IsoDate, Portfolio } from "../types";
import { assumptions, portfolio as seed } from "./support/seed";
import { mixed } from "./support/mixed";
import { mixedWithRefi, synthetic } from "./support/synthetic";
import { money } from "../brands";

/** The `useEngine` memo body before P9, plus ADR 0103's financing exposure. */
function separate(p: Portfolio, a: Assumptions, asOf: IsoDate) {
  const schedules = schedulesByProperty(
    p.mortgages,
    p.properties.map((x) => x.id),
    a,
  );
  return {
    schedules,
    snapshot: portfolioSnapshot(p, a, asOf, schedules),
    projection: portfolioProjection(p, a),
    kpis: portfolioKpis(p, a),
    financing: financingExposure(p, a, schedules, asOf),
  };
}

const shocked = applyScenario(assumptions, {
  appreciationPa: rate("0.02"),
  inflationShock: { deltaPa: rate("0.05"), durationYears: 3 },
  rateShock: { deltaPa: rate("0.02"), durationYears: 5 },
  valueShock: { pct: rate("0.2"), atYear: 2 },
});

/** Every loan with two prepayments and a recast (ADR 0109; #130 G1-6-04): the seed
 *  loans replay the first prepayment as history, the dev loan meets them after its
 *  completion, the future loan after its draw. */
const withEvents = (p: Portfolio): Portfolio => ({
  ...p,
  mortgages: p.mortgages.map((m) => ({
    ...m,
    prepayments: [
      {
        date: edate(m.startDate, 61),
        amount: money("150000"),
        effect: "shortenTerm",
      },
      {
        date: edate(m.startDate, 97),
        amount: money("100000"),
        effect: "lowerInstalment",
        fee: money("2000"),
      },
    ],
    recasts: [
      { date: edate(m.startDate, 121), maturity: edate(m.startDate, 300) },
    ],
  })),
});
const seedEvents = withEvents(seed);
const mixedEvents = withEvents(mixed);

const PORTFOLIOS: [string, Portfolio][] = [
  ["seed", seed],
  ["mixed", mixed],
  ["seed + events", seedEvents],
  ["mixed + events", mixedEvents],
  ["mixed + refinance", mixedWithRefi],
  ["synthetic 20", synthetic(20)],
  [
    "empty",
    {
      ...seed,
      properties: [],
      mortgages: [],
      valuations: [],
      leases: [],
      holdingCosts: [],
    },
  ],
];

const ASSUMPTIONS: [string, Assumptions][] = [
  ["base", assumptions],
  ["shocked scenario", shocked],
];

describe("portfolioOutputs = the separate public calls", () => {
  it("the event portfolios apply every event", () => {
    for (const p of [seedEvents, mixedEvents]) {
      const outcomes = [
        ...propertySchedules(
          p.mortgages,
          p.properties.map((x) => x.id),
          assumptions,
        ).values(),
      ].flatMap((s) => s.eventOutcomes);
      expect(outcomes.map((o) => [o.blockId, o.kind, o.issue])).toEqual(
        p.mortgages.flatMap((m) => [
          [m.id, "prepayment", null],
          [m.id, "prepayment", null],
          [m.id, "recast", null],
        ]),
      );
    }
  });

  for (const [pName, p] of PORTFOLIOS) {
    for (const [aName, a] of ASSUMPTIONS) {
      it(`${pName}, ${aName}`, () => {
        expect(portfolioOutputs(p, a, a.baseDate)).toEqual(
          separate(p, a, a.baseDate),
        );
      });
    }
  }

  it("a later as-of date", () => {
    const asOf = edate(assumptions.baseDate, 30);
    expect(portfolioOutputs(mixedWithRefi, assumptions, asOf)).toEqual(
      separate(mixedWithRefi, assumptions, asOf),
    );
  });

  it("as-of defaults to baseDate", () => {
    expect(portfolioOutputs(seed, assumptions)).toEqual(
      separate(seed, assumptions, assumptions.baseDate),
    );
  });
});

describe("projectionAndKpis = portfolioProjection + portfolioKpis", () => {
  for (const [pName, p] of PORTFOLIOS) {
    for (const [aName, a] of ASSUMPTIONS) {
      it(`${pName}, ${aName}`, () => {
        expect(projectionAndKpis(p, a)).toEqual({
          projection: portfolioProjection(p, a),
          kpis: portfolioKpis(p, a),
        });
      });
    }
  }
});

/** The error a call throws, as a comparable value (fails if it does not throw). */
function thrown(f: () => unknown) {
  try {
    f();
  } catch (e) {
    if (!(e instanceof EngineInputError)) throw e;
    return { message: e.message, errors: e.errors };
  }
  throw new Error("expected a throw");
}

describe("invalid inputs throw the same error first", () => {
  const badLoan: Portfolio = {
    ...seed,
    mortgages: seed.mortgages.map((m, i) =>
      i === 0 ? { ...m, monthlyInstalment: money("1") } : m,
    ),
  };
  const duplicateStart: Portfolio = {
    ...seed,
    mortgages: [
      ...seed.mortgages,
      { ...seed.mortgages[0]!, id: "m-dup", initialPrincipal: money("100000") },
    ],
  };
  const orphanLease: Portfolio = {
    ...seed,
    leases: [
      ...seed.leases,
      {
        id: "l-orphan",
        propertyId: "nope",
        startDate: isoDate("2026-01-01"),
        monthlyRent: money("1000"),
      },
    ],
  };
  const badAssumptions: Assumptions = { ...assumptions, horizonYears: 0 };
  const CASES: [string, Portfolio, Assumptions][] = [
    ["instalment below interest", badLoan, assumptions],
    ["duplicate block start", duplicateStart, assumptions],
    ["orphan lease", orphanLease, assumptions],
    ["invalid assumptions", seed, badAssumptions],
  ];
  for (const [name, p, a] of CASES) {
    it(name, () => {
      expect(thrown(() => portfolioOutputs(p, a, a.baseDate))).toEqual(
        thrown(() => separate(p, a, a.baseDate)),
      );
      expect(thrown(() => projectionAndKpis(p, a))).toEqual(
        thrown(() => portfolioProjection(p, a)),
      );
    });
  }

  it("an as-of date before baseDate", () => {
    const asOf = edate(assumptions.baseDate, -1);
    expect(thrown(() => portfolioOutputs(seed, assumptions, asOf))).toEqual(
      thrown(() => separate(seed, assumptions, asOf)),
    );
  });
});
