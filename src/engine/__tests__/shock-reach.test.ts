// #481 (ADR 0100, 0116, 0162): which blocks a scenario rate shock reaches, on the chain
// the schedule follows and the fixation end `rateAt` switches on. The Scenarios page
// words it; the engine decides it. The last block checks the answer against the
// projection itself, with and without the shock.
import { describe, it, expect } from "vitest";
import { blocksReachedByShock } from "../shockReach";
import { portfolioProjection } from "../projections";
import { applyScenario } from "../scenarios";
import { isoDate } from "../dates";
import { money, rate } from "../brands";
import { assumptions, portfolio } from "./support/seed";
import { devBlock, mixed } from "./support/mixed";
import type { MortgageBlock, Portfolio, ShockBand } from "../types";

const shock = (durationYears: number): ShockBand => ({
  deltaPa: rate("0.02"),
  durationYears,
});

function block(
  id: string,
  startDate: string,
  fixationYears: number,
  loanTermYears = 30,
  propertyId = "p1",
): MortgageBlock {
  return {
    id,
    propertyId,
    startDate: isoDate(startDate),
    initialPrincipal: money("3000000"),
    fixationYears,
    interestRatePa: rate("0.04"),
    monthlyInstalment: money("15000"),
    loanTermYears,
  };
}

function withBlocks(
  mortgages: MortgageBlock[],
  inactive: string[] = [],
): Portfolio {
  const ids = [...new Set(mortgages.map((m) => m.propertyId)), ...inactive];
  return {
    properties: ids.map((id) => ({
      id,
      name: id,
      type: "flat",
      sizeM2: 50,
      purchaseDate: isoDate("2015-01-01"),
      purchasePrice: money("5000000"),
      active: !inactive.includes(id),
    })),
    mortgages,
    valuations: [],
    leases: [],
    holdingCosts: [],
  };
}

// baseDate 2026-06-07, horizon 30 years (the seed's assumptions).
const reachOf = (mortgages: MortgageBlock[], years = 3, inactive?: string[]) =>
  blocksReachedByShock(
    withBlocks(mortgages, inactive),
    assumptions,
    shock(years),
  );
const only = (mortgages: MortgageBlock[], years = 3) => {
  const [loan] = reachOf(mortgages, years);
  return loan?.blocks[0];
};

describe("blocksReachedByShock", () => {
  it("hits a block that refixes inside the horizon, at its fixation end", () => {
    const b = only([block("a", "2021-01-17", 10)]);
    expect(b).toEqual({
      blockId: "a",
      hit: true,
      fixedUntil: isoDate("2031-01-17"),
    });
  });

  it("misses a block a prepayment repays before its refix (ADR 0116)", () => {
    const b = only([
      {
        ...block("a", "2021-01-17", 10),
        prepayments: [
          {
            date: isoDate("2028-02-01"),
            amount: money("5000000"),
            effect: "lowerInstalment",
          },
        ],
      },
    ]);
    expect(b).toMatchObject({ hit: false, reason: "fixedToMaturity" });
  });

  it("hits a block a recast keeps running past its contract maturity", () => {
    const b = only([
      {
        ...block("a", "2021-01-17", 10, 10),
        recasts: [
          { date: isoDate("2028-01-17"), maturity: isoDate("2041-01-17") },
        ],
      },
    ]);
    expect(b?.hit).toBe(true);
  });

  it.each([
    [
      "fixed to maturity",
      block("a", "2020-01-01", 20, 20),
      3,
      "fixedToMaturity",
    ],
    [
      "window ended before baseDate",
      block("a", "2015-01-01", 5),
      3,
      "windowEnded",
    ],
    [
      "window ending on baseDate",
      block("a", "2020-06-07", 5),
      1,
      "windowEnded",
    ],
    [
      "floating, repaid before baseDate",
      { ...block("a", "2000-01-01", 0, 10), monthlyInstalment: money("31000") },
      3,
      "repaid",
    ],
    [
      "refixing after the horizon",
      {
        ...block("a", "2026-01-01", 31, 40),
        monthlyInstalment: money("12600"),
      },
      3,
      "refixAfterHorizon",
    ],
  ] as const)("misses a block %s", (_name, b, years, reason) => {
    expect(only([b], years)).toMatchObject({ hit: false, reason });
  });

  it.each([
    [
      "the rest of an expired fixation's window",
      block("a", "2020-06-01", 5),
      3,
      "2025-06-01",
    ],
    [
      "a floating block from baseDate (ADR 0162)",
      block("a", "2015-01-01", 0),
      1,
      "2026-06-07",
    ],
    [
      "a future floating block from its start",
      block("a", "2027-03-01", 0),
      1,
      "2027-03-01",
    ],
    [
      "a fixation ending on baseDate",
      block("a", "2019-06-07", 7),
      1,
      "2026-06-07",
    ],
    [
      "a block starting after baseDate",
      block("a", "2027-01-01", 3),
      3,
      "2030-01-01",
    ],
  ] as const)("hits %s", (_name, b, years, fixedUntil) => {
    expect(only([b], years)).toEqual({
      blockId: "a",
      hit: true,
      fixedUntil: isoDate(fixedUntil),
    });
  });

  it("misses a block replaced before its refix; its successor can be hit", () => {
    const [loan] = reachOf([
      block("a", "2022-01-01", 7),
      block("b", "2028-01-01", 5),
    ]);
    expect(loan?.blocks.map((b) => [b.blockId, b.hit, b.reason])).toEqual([
      ["a", false, "replacedBySuccessor"],
      ["b", true, undefined],
    ]);
  });

  it("reports a property's block chain as one loan, skipping inactive and loan-free properties", () => {
    const reach = reachOf(
      [
        block("a", "2022-01-01", 7),
        block("b", "2028-01-01", 30, 30),
        block("c", "2021-01-17", 10, 30, "off"),
      ],
      3,
      ["off", "nomortgage"],
    );
    expect(reach.map((l) => [l.propertyId, l.blocks.length])).toEqual([
      ["p1", 2],
    ]);
    expect(reachOf([])).toEqual([]);
  });

  it("hits every loan of the sample portfolio with +2 pp for 3 years", () => {
    const reach = blocksReachedByShock(portfolio, assumptions, shock(3));
    expect(
      reach.map((l) => [
        l.propertyId,
        l.blocks.map((b) => [b.hit, b.fixedUntil.toISOString().slice(0, 10)]),
      ]),
    ).toEqual([
      ["javorova", [[true, "2031-01-17"]]],
      ["lipova", [[true, "2029-01-15"]]],
      ["dubova", [[true, "2031-03-12"]]],
    ]);
  });
});

// The reach must agree with the projection: a portfolio's net cash flows move under
// the shock exactly when some block is hit.
describe("blocksReachedByShock agrees with the shocked projection", () => {
  const variant = (
    name: string,
    hit: boolean,
    edit: (m: MortgageBlock) => MortgageBlock,
    extra: MortgageBlock[] = [],
    durationYears = 3,
    base: Portfolio = portfolio,
  ) => ({
    name,
    hit,
    p: { ...base, mortgages: [...base.mortgages.map(edit), ...extra] },
    durationYears,
  });
  const same = (m: MortgageBlock) => m;
  const pastHorizon = (m: MortgageBlock) => ({
    ...m,
    fixationYears: 40,
    loanTermYears: 45,
  });
  // Lipova refixes on 2029-01-15; the other loans refix after the horizon.
  const onlyLipova = (m: MortgageBlock) =>
    m.propertyId === "lipova" ? m : pastHorizon(m);
  const lipovaSuccessor = (fixationYears: number) => ({
    ...block("m-lipova-2", "2028-06-15", fixationYears, 25, "lipova"),
    monthlyInstalment: money("25000"),
  });
  // Every block of the mixed fixture but the development loan refixes past the horizon.
  const onlyDev = (m: MortgageBlock) =>
    m.id === devBlock.id ? m : pastHorizon(m);

  const variants = [
    variant("sample", true, same),
    variant("sample, 1-year shock", true, same, [], 1),
    variant("fixation past the horizon", false, pastHorizon),
    variant("fixation to maturity", false, (m) => ({
      ...m,
      fixationYears: 30,
      loanTermYears: 30,
    })),
    variant("fixation of 1 year", true, (m) => ({ ...m, fixationYears: 1 })),
    variant("window ended before baseDate", false, (m) =>
      m.propertyId === "dubova" ? pastHorizon(m) : { ...m, fixationYears: 1 },
    ),
    variant("only lipova refixes in the window", true, onlyLipova),
    variant(
      "javorova floats, 1-year shock",
      true,
      (m) =>
        m.propertyId === "javorova"
          ? { ...m, fixationYears: 0 }
          : pastHorizon(m),
      [],
      1,
    ),
    variant(
      "floating lipova replaced at baseDate by a fixed block",
      false,
      (m) =>
        m.propertyId === "lipova" ? { ...m, fixationYears: 0 } : pastHorizon(m),
      [
        {
          ...block("m-lipova-2", "2026-06-10", 25, 25, "lipova"),
          monthlyInstalment: money("25000"),
        },
      ],
      1,
    ),
    variant(
      "future floating successor, 1-year shock",
      true,
      pastHorizon,
      [lipovaSuccessor(0)],
      1,
    ),
    variant("successor fixed to maturity", false, onlyLipova, [
      lipovaSuccessor(25),
    ]),
    variant("successor refixes in the window", true, onlyLipova, [
      lipovaSuccessor(5),
    ]),
    variant("lipova repaid before its refix", false, (m) =>
      m.propertyId === "lipova"
        ? {
            ...m,
            prepayments: [
              {
                date: isoDate("2028-03-01"),
                amount: money("10000000"),
                effect: "lowerInstalment" as const,
              },
            ],
          }
        : pastHorizon(m),
    ),
    // The development loan refixes in 2031; a successor replacing it in 2030 takes the
    // refix with it.
    variant("development loan refixes", true, onlyDev, [], 3, mixed),
    variant(
      "development loan replaced before its refix by a long fixation",
      false,
      onlyDev,
      [
        {
          ...block("m-dev-2", "2030-03-01", 30, 30, "dev"),
          initialPrincipal: money("4300000"),
        },
      ],
      3,
      mixed,
    ),
  ];

  it.each(variants)("$name", ({ p, hit, durationYears }) => {
    const s = shock(durationYears);
    const flows = (withShock: boolean) =>
      portfolioProjection(
        p,
        applyScenario(assumptions, withShock ? { rateShock: s } : {}),
      ).map((y) => y.netCashFlow.toString());
    expect(flows(true).join() !== flows(false).join()).toBe(hit);
    const reached = blocksReachedByShock(p, assumptions, s);
    expect(reached.some((l) => l.blocks.some((b) => b.hit))).toBe(hit);
  });
});
