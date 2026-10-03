// ADR 0100 (#47): which loans a scenario rate shock reaches. The helper reads block
// dates only; the tripwire at the end runs the engine with and without the shock so the
// helper cannot drift from `rateAt`.
import { describe, it, expect } from "vitest";
import {
  applyScenario,
  isoDate,
  money,
  mortgageBlock,
  portfolioProjection,
  rate,
} from "../../../engine";
import type {
  MortgageBlock,
  Portfolio,
  Scenario,
  ShockBand,
} from "../../../engine";
import { assumptions, portfolio } from "../../../engine/__tests__/support/seed";
import { en } from "../../../i18n/en";
import { cs } from "../../../i18n/cs";
import { ru } from "../../../i18n/ru";
import { rateShockNote, rateShockReach, reachSummary } from "../rateShockReach";

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
  rateShockReach(withBlocks(mortgages, inactive), assumptions, shock(years));

describe("rateShockReach", () => {
  it("hits a loan that refixes inside the horizon", () => {
    const [loan] = reachOf([block("a", "2021-01-17", 10)]);
    expect(loan).toMatchObject({ propertyId: "p1", hit: true });
    expect(loan?.refixYears).toEqual([2031]);
  });

  // ADR 0116: the maturity in force after prepayments and recasts, not the contract's.
  it("misses a loan a prepayment repays before its refix", () => {
    const [loan] = reachOf([
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
    expect(loan?.hit).toBe(false);
    // Repaid within its fixation: the fixation now runs to the maturity in force.
    expect(loan?.blocks[0]?.reason).toBe("fixedToMaturity");
  });

  it("hits a loan a recast keeps running past its contract maturity", () => {
    // Contract: 2021 + 10 years, fixed for 10: fixed to maturity without the recast.
    const [loan] = reachOf([
      {
        ...block("a", "2021-01-17", 10, 10),
        recasts: [
          { date: isoDate("2028-01-17"), maturity: isoDate("2041-01-17") },
        ],
      },
    ]);
    expect(loan?.hit).toBe(true);
  });

  it("misses a loan fixed to maturity", () => {
    const [loan] = reachOf([block("a", "2020-01-01", 20, 20)]);
    expect(loan?.hit).toBe(false);
    expect(loan?.blocks[0]?.reason).toBe("fixedToMaturity");
  });

  it("misses a loan whose shock window ended before baseDate", () => {
    const [loan] = reachOf([block("a", "2015-01-01", 5)]);
    expect(loan?.hit).toBe(false);
    expect(loan?.blocks[0]?.reason).toBe("windowEnded");
  });

  it("misses a window that ends on baseDate (only later payments are shocked)", () => {
    const [loan] = reachOf([block("a", "2020-06-07", 5)], 1);
    expect(loan?.blocks[0]?.reason).toBe("windowEnded");
  });

  it("hits the rest of a window that started before baseDate (expired fixation)", () => {
    const [loan] = reachOf([block("a", "2020-06-01", 5)]);
    expect(loan?.hit).toBe(true);
    expect(loan?.refixYears).toEqual([2025]);
  });

  it("hits a loan whose fixation ends on baseDate", () => {
    const [loan] = reachOf([block("a", "2019-06-07", 7)], 1);
    expect(loan?.hit).toBe(true);
    expect(loan?.refixYears).toEqual([2026]);
  });

  it("misses a loan that refixes after the horizon", () => {
    const [loan] = reachOf([block("a", "2026-01-01", 31, 40)]);
    expect(loan?.hit).toBe(false);
    expect(loan?.blocks[0]?.reason).toBe("refixAfterHorizon");
  });

  it("hits a loan that starts after baseDate", () => {
    const [loan] = reachOf([block("a", "2027-01-01", 3)]);
    expect(loan?.refixYears).toEqual([2030]);
  });

  it("misses a block replaced before its refix, but its successor can be hit", () => {
    const [loan] = reachOf([
      block("a", "2022-01-01", 7),
      block("b", "2028-01-01", 5),
    ]);
    expect(loan?.blocks.map((b) => [b.blockId, b.hit, b.reason])).toEqual([
      ["a", false, "replacedBySuccessor"],
      ["b", true, undefined],
    ]);
    expect(loan?.hit).toBe(true);
    expect(loan?.refixYears).toEqual([2033]);
  });

  it("counts a property's block chain as one loan", () => {
    const reach = reachOf([
      block("a", "2022-01-01", 7),
      block("b", "2028-01-01", 30, 30),
    ]);
    expect(reach).toHaveLength(1);
    expect(reach[0]?.hit).toBe(false);
  });

  it("skips inactive properties and properties without a mortgage", () => {
    const reach = reachOf(
      [block("a", "2021-01-17", 10), block("b", "2021-01-17", 10, 30, "off")],
      3,
      ["off", "nomortgage"],
    );
    expect(reach.map((l) => l.propertyId)).toEqual(["p1"]);
  });

  it("returns no loans for a portfolio without mortgages", () => {
    expect(reachOf([])).toEqual([]);
  });

  it("hits all 3 loans of the sample portfolio with +2 pp for 3 years", () => {
    const reach = rateShockReach(portfolio, assumptions, shock(3));
    expect(reach.map((l) => [l.propertyId, l.refixYears])).toEqual([
      ["javorova", [2031]],
      ["lipova", [2029]],
      ["dubova", [2031]],
    ]);
  });
});

describe("reachSummary", () => {
  const twoLoans = [
    block("a", "2021-01-17", 10),
    block("b", "2022-01-15", 7, 30, "p2"),
    block("c", "2015-01-01", 5, 30, "p3"),
  ];

  it("names how many loans are hit and the deduplicated, sorted refix years", () => {
    const reach = reachOf([
      ...twoLoans,
      block("d", "2021-03-01", 10, 30, "p4"),
    ]);
    expect(reachSummary(reach, en)).toBe(
      "hits 3 of 4 loans (refix 2029, 2031)",
    );
  });

  it("says when no loan is hit", () => {
    const reach = reachOf([block("c", "2015-01-01", 5)]);
    expect(reachSummary(reach, en)).toBe(en.scenarios.reachNone);
  });

  it("says nothing without loans", () => {
    expect(reachSummary([], en)).toBeUndefined();
  });

  it("uses the singular and the cs/ru plural forms", () => {
    const one = reachOf([block("a", "2021-01-17", 10)]);
    expect(reachSummary(one, en)).toBe("hits 1 of 1 loan (refix 2031)");
    expect(reachSummary(one, cs)).toBe("zasáhne 1 z 1 úvěru (refixace 2031)");
    expect(reachSummary(one, ru)).toBe(
      "затрагивает 1 из 1 кредита (конец фиксации 2031)",
    );
    const reach = reachOf(twoLoans);
    expect(reachSummary(reach, cs)).toBe(
      "zasáhne 2 z 3 úvěrů (refixace 2029, 2031)",
    );
    expect(reachSummary(reach, ru)).toBe(
      "затрагивает 2 из 3 кредитов (конец фиксации 2029, 2031)",
    );
  });
});

describe("rateShockNote", () => {
  const scenario = (overrides: Scenario["overrides"]): Scenario => ({
    id: "s",
    name: "s",
    overrides,
    createdAt: assumptions.baseDate,
  });

  it("is the reach summary of a rate-shock scenario", () => {
    expect(
      rateShockNote(
        scenario({ rateShock: shock(3) }),
        portfolio,
        assumptions,
        en,
      ),
    ).toBe("hits 3 of 3 loans (refix 2029, 2031)");
  });

  it("is undefined without a rate shock or without data", () => {
    expect(rateShockNote(scenario({}), portfolio, assumptions, en)).toBe(
      undefined,
    );
    expect(
      rateShockNote(scenario({ rateShock: shock(3) }), null, assumptions, en),
    ).toBeUndefined();
  });

  it("is undefined when a loan has no term (invalid data)", () => {
    const noTerm = mortgageBlock({
      ...block("a", "2021-01-17", 10),
      loanTermYears: undefined,
      monthlyInstalment: money("0"),
    });
    expect(
      rateShockNote(
        scenario({ rateShock: shock(3) }),
        withBlocks([noTerm]),
        assumptions,
        en,
      ),
    ).toBeUndefined();
  });
});

// The helper must agree with the engine: no loan hit ⇔ the shock changes no year's net
// cash flow. Net worth is not the check: the sample is hit, but every loan is repaid
// before the horizon, so its net worth does not change.
describe("tripwire: the helper agrees with the engine", () => {
  const variant = (
    name: string,
    hit: boolean,
    edit: (m: MortgageBlock) => MortgageBlock,
    extra: MortgageBlock[] = [],
    durationYears = 3,
  ) => ({
    name,
    hit,
    p: {
      ...portfolio,
      mortgages: [...portfolio.mortgages.map(edit), ...extra],
    },
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
  // A successor that replaces lipova's block before that refix.
  const lipovaSuccessor = (fixationYears: number) => ({
    ...block("m-lipova-2", "2028-06-15", fixationYears, 25, "lipova"),
    monthlyInstalment: money("25000"),
  });

  const variants = [
    variant("sample", true, same),
    variant("sample, 1-year shock", true, same, [], 1),
    variant("fixation past the horizon", false, pastHorizon),
    variant("fixation to maturity", false, (m) => ({
      ...m,
      fixationYears: 30,
      loanTermYears: 30,
    })),
    // Refixes 2022–2025: only dubova's window (to 2028) is still open.
    variant("fixation of 1 year", true, (m) => ({ ...m, fixationYears: 1 })),
    variant("window ended before baseDate", false, (m) =>
      m.propertyId === "dubova" ? pastHorizon(m) : { ...m, fixationYears: 1 },
    ),
    variant("only lipova refixes in the window", true, onlyLipova),
    variant("successor fixed to maturity", false, onlyLipova, [
      lipovaSuccessor(25),
    ]),
    variant("successor refixes in the window", true, onlyLipova, [
      lipovaSuccessor(5),
    ]),
    // ADR 0116: a prepayment repays lipova before its 2029 refix.
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
  ];

  it.each(variants)("$name", ({ p, hit, durationYears }) => {
    const s = shock(durationYears);
    const flows = (withShock: boolean) =>
      portfolioProjection(
        p,
        applyScenario(assumptions, withShock ? { rateShock: s } : {}),
      ).map((y) => y.netCashFlow.toString());
    expect(flows(true).join() !== flows(false).join()).toBe(hit);
    expect(rateShockReach(p, assumptions, s).some((l) => l.hit)).toBe(hit);
  });
});
