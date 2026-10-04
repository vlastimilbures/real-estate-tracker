// D-37: the engine raises a typed EngineInputError for corrupt portfolio data instead of
// computing NaN, a rolled-over date or a silent first-row pick (DR-035, DR-071). Every
// public entry point that takes the portfolio raises; the loan path raises the loan
// row's own problems.
import { describe, it, expect } from "vitest";
import { rate } from "../brands";
import { isoDate } from "../dates";
import { schedulesByProperty } from "../schedule";
import { portfolioSnapshot, propertySnapshot } from "../metrics";
import { portfolioProjection, propertyProjection } from "../projections";
import { portfolioKpis } from "../kpis";
import { portfolioOutputs, projectionAndKpis } from "../outputs";
import { cpiIndex } from "../projections";
import { cpiAt } from "../real";
import { EngineInputError } from "../errors";
import type { EngineValidationError } from "../validate";
import type { Assumptions, IsoDate, Portfolio } from "../types";
import { assumptions, portfolio } from "./support/seed";
import { mixed } from "./support/mixed";
import { money } from "../brands";

const NaD = new Date(NaN) as IsoDate;
const ids = (p: Portfolio) => p.properties.map((x) => x.id);
const seedSchedules = schedulesByProperty(
  portfolio.mortgages,
  ids(portfolio),
  assumptions,
);

/** Every public entry point that takes a portfolio, run on `p` and `a`. */
function entryPoints(p: Portfolio, a: Assumptions) {
  const first = p.properties[0];
  return {
    portfolioSnapshot: () => portfolioSnapshot(p, a),
    portfolioSnapshotWithSchedules: () =>
      portfolioSnapshot(p, a, a.baseDate, seedSchedules),
    propertySnapshot: () => propertySnapshot(first, p, a),
    portfolioProjection: () => portfolioProjection(p, a),
    propertyProjection: () =>
      propertyProjection(first, p, a, seedSchedules.get(first.id) ?? []),
    portfolioKpis: () => portfolioKpis(p, a),
  };
}

function errorsOf(fn: () => unknown): readonly EngineValidationError[] {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(EngineInputError);
    return (e as EngineInputError).errors;
  }
  throw new Error("expected an EngineInputError");
}

const [petr] = portfolio.properties;
const [val] = portfolio.valuations;
const [lease] = portfolio.leases;
const [cost] = portfolio.holdingCosts;

const DATA_CASES: [string, Portfolio, EngineValidationError][] = [
  [
    "invalid purchase date",
    {
      ...portfolio,
      properties: [
        { ...petr, purchaseDate: NaD },
        ...portfolio.properties.slice(1),
      ],
    },
    {
      code: "INVALID_DATE",
      entity: "property",
      id: petr.id,
      field: "purchaseDate",
    },
  ],
  [
    "invalid lease start",
    {
      ...portfolio,
      leases: [{ ...lease, startDate: NaD }, ...portfolio.leases.slice(1)],
    },
    { code: "INVALID_DATE", entity: "lease", id: lease.id, field: "startDate" },
  ],
  [
    "non-finite market value",
    {
      ...portfolio,
      valuations: [
        { ...val, marketValue: money(NaN) },
        ...portfolio.valuations.slice(1),
      ],
    },
    {
      code: "NON_FINITE_NUMBER",
      entity: "valuation",
      id: val.id,
      field: "marketValue",
    },
  ],
  [
    "negative market value",
    {
      ...portfolio,
      valuations: [
        { ...val, marketValue: money(-1) },
        ...portfolio.valuations.slice(1),
      ],
    },
    {
      code: "NEGATIVE_AMOUNT",
      entity: "valuation",
      id: val.id,
      field: "marketValue",
    },
  ],
  [
    "negative holding cost (D-54)",
    {
      ...portfolio,
      holdingCosts: [
        { ...cost, insuranceYr: money(-1) },
        ...portfolio.holdingCosts.slice(1),
      ],
    },
    {
      code: "NEGATIVE_AMOUNT",
      entity: "holdingCost",
      id: cost.id,
      field: "insuranceYr",
    },
  ],
  [
    "holding-cost share above 1 (D-54)",
    {
      ...portfolio,
      holdingCosts: [
        { ...cost, mgmtPctRent: rate("1.5") },
        ...portfolio.holdingCosts.slice(1),
      ],
    },
    {
      code: "RATE_OUT_OF_RANGE",
      entity: "holdingCost",
      id: cost.id,
      field: "mgmtPctRent",
    },
  ],
  [
    "negative rent",
    {
      ...portfolio,
      leases: [
        { ...lease, monthlyRent: money(-1) },
        ...portfolio.leases.slice(1),
      ],
    },
    {
      code: "NEGATIVE_AMOUNT",
      entity: "lease",
      id: lease.id,
      field: "monthlyRent",
    },
  ],
  [
    "negative purchase price",
    {
      ...portfolio,
      properties: [
        { ...petr, purchasePrice: money(-1) },
        ...portfolio.properties.slice(1),
      ],
    },
    {
      code: "NEGATIVE_AMOUNT",
      entity: "property",
      id: petr.id,
      field: "purchasePrice",
    },
  ],
  [
    "orphan lease",
    {
      ...portfolio,
      leases: [
        ...portfolio.leases,
        { ...lease, id: "l-orphan", propertyId: "nope" },
      ],
    },
    {
      code: "ORPHAN_ROW",
      entity: "lease",
      id: "l-orphan",
      field: "propertyId",
    },
  ],
  [
    "lease ending before it starts",
    {
      ...portfolio,
      leases: [
        { ...lease, endDate: isoDate("2020-01-01") },
        ...portfolio.leases.slice(1),
      ],
    },
    {
      code: "END_BEFORE_START",
      entity: "lease",
      id: lease.id,
      field: "endDate",
    },
  ],
  [
    "duplicate holding cost",
    {
      ...portfolio,
      holdingCosts: [...portfolio.holdingCosts, { ...cost, id: "h-dup" }],
    },
    {
      code: "DUPLICATE_HOLDING_COST",
      entity: "holdingCost",
      id: "h-dup",
      field: undefined,
    },
  ],
  ...(
    [
      ["ownCash", money("-1"), "NEGATIVE_AMOUNT"],
      ["transactionCosts", money("-0.01"), "NEGATIVE_AMOUNT"],
      ["initialWorks", money("-250000"), "NEGATIVE_AMOUNT"],
      ["ownCash", money(NaN), "NON_FINITE_NUMBER"],
      ["initialWorks", money(Infinity), "NON_FINITE_NUMBER"],
    ] as const
  ).map(([field, amount, code]): [string, Portfolio, EngineValidationError] => [
    `funding ${field} ${amount.toString()} (ADR 0119)`,
    {
      ...portfolio,
      properties: [
        { ...petr, funding: { [field]: amount } },
        ...portfolio.properties.slice(1),
      ],
    },
    { code, entity: "property", id: petr.id, field },
  ]),
];

describe("D-37 data-integrity codes raise at every entry point", () => {
  for (const [name, p, expected] of DATA_CASES) {
    describe(name, () => {
      for (const [entry, run] of Object.entries(entryPoints(p, assumptions))) {
        it(entry, () => {
          expect(errorsOf(run)).toContainEqual(expected);
        });
      }
    });
  }

  it("a non-finite assumption raises, including on the schedule path", () => {
    const a = { ...assumptions, inflationPa: rate(Infinity) };
    const expected = {
      code: "NON_FINITE_NUMBER",
      entity: "assumptions",
      field: "inflationPa",
    };
    for (const run of Object.values(entryPoints(portfolio, a))) {
      expect(errorsOf(run)).toContainEqual(expected);
    }
    expect(
      errorsOf(() =>
        schedulesByProperty(portfolio.mortgages, ids(portfolio), a),
      ),
    ).toContainEqual(expected);
  });

  it("the loan path raises a mortgage row's own data problems", () => {
    const [m] = portfolio.mortgages;
    const bad = { ...m, startDate: NaD };
    expect(
      errorsOf(() => schedulesByProperty([bad], [m.propertyId], assumptions)),
    ).toContainEqual({
      code: "INVALID_DATE",
      entity: "mortgage",
      id: m.id,
      field: "startDate",
    });
  });

  it("control: a funding record of zeros and a note raises nowhere (ADR 0119)", () => {
    const p: Portfolio = {
      ...portfolio,
      properties: [
        {
          ...petr,
          funding: {
            ownCash: money(0),
            transactionCosts: money(0),
            initialWorks: money(0),
            note: "paid in full",
          },
        },
        ...portfolio.properties.slice(1),
      ],
    };
    for (const run of Object.values(entryPoints(p, assumptions))) {
      expect(run).not.toThrow();
    }
  });

  it("control: the seed and the mixed fixture raise nowhere", () => {
    for (const p of [portfolio, mixed]) {
      for (const run of Object.values(entryPoints(p, assumptions))) {
        expect(run).not.toThrow();
      }
    }
  });
});

// D-38: the range codes raise too. Growth, indexation, inflation and shock deltas may be
// negative, above −100 % (ADR 0128).
const RANGE_CASES: [string, Partial<Assumptions>, EngineValidationError][] = [
  [
    "negative reset rate (ADR 0128)",
    { postFixationResetRatePa: rate("-0.05") },
    {
      code: "RATE_OUT_OF_RANGE",
      entity: "assumptions",
      field: "postFixationResetRatePa",
    },
  ],
  [
    "inflation of −100 % (ADR 0128)",
    { inflationPa: rate("-1") },
    {
      code: "GROWTH_OUT_OF_RANGE",
      entity: "assumptions",
      field: "inflationPa",
    },
  ],
  [
    "a rate shock below a zero rate (ADR 0128)",
    { rateShock: { deltaPa: rate("-0.10"), durationYears: 5 } },
    {
      code: "SHOCKED_RATE_OUT_OF_RANGE",
      entity: "assumptions",
      field: "rateShock",
    },
  ],
  [
    "an inflation shock to −100 % or less (ADR 0128)",
    { inflationShock: { deltaPa: rate("-1.2"), durationYears: 2 } },
    {
      code: "SHOCKED_INFLATION_OUT_OF_RANGE",
      entity: "assumptions",
      field: "inflationShock",
    },
  ],
  [
    "zero horizon",
    { horizonYears: 0 },
    {
      code: "HORIZON_NOT_POSITIVE",
      entity: "assumptions",
      field: "horizonYears",
    },
  ],
  [
    "fractional horizon",
    { horizonYears: 1.5 },
    {
      code: "HORIZON_NOT_POSITIVE",
      entity: "assumptions",
      field: "horizonYears",
    },
  ],
  [
    "vacancy above 1",
    { vacancyAllowance: rate("1.2") },
    {
      code: "RATE_OUT_OF_RANGE",
      entity: "assumptions",
      field: "vacancyAllowance",
    },
  ],
  [
    "acquisition cost rate above 1 (ADR 0119)",
    { acquisitionCostPct: rate("1.5") },
    {
      code: "RATE_OUT_OF_RANGE",
      entity: "assumptions",
      field: "acquisitionCostPct",
    },
  ],
  [
    "negative acquisition cost rate (ADR 0119)",
    { acquisitionCostPct: rate("-0.5") },
    {
      code: "RATE_OUT_OF_RANGE",
      entity: "assumptions",
      field: "acquisitionCostPct",
    },
  ],
  [
    "negative default management share",
    { defaults: { ...assumptions.defaults, mgmtPctRent: rate("-0.1") } },
    {
      code: "RATE_OUT_OF_RANGE",
      entity: "assumptions",
      field: "defaults.mgmtPctRent",
    },
  ],
  [
    "negative shock duration",
    { rateShock: { deltaPa: rate("0.02"), durationYears: -1 } },
    { code: "SHOCK_OUT_OF_RANGE", entity: "assumptions", field: "rateShock" },
  ],
  [
    "fractional shock duration",
    { inflationShock: { deltaPa: rate("0.02"), durationYears: 1.5 } },
    {
      code: "SHOCK_OUT_OF_RANGE",
      entity: "assumptions",
      field: "inflationShock",
    },
  ],
  [
    "value haircut above 1",
    { valueShock: { pct: rate("1.5"), atYear: 2 } },
    { code: "SHOCK_OUT_OF_RANGE", entity: "assumptions", field: "valueShock" },
  ],
];

describe("D-38 range codes raise at every entry point", () => {
  for (const [name, override, expected] of RANGE_CASES) {
    describe(name, () => {
      const a = { ...assumptions, ...override } as Assumptions;
      for (const [entry, run] of Object.entries(entryPoints(portfolio, a))) {
        it(entry, () => {
          expect(errorsOf(run)).toContainEqual(expected);
        });
      }
      it("schedulesByProperty", () => {
        expect(
          errorsOf(() =>
            schedulesByProperty(portfolio.mortgages, ids(portfolio), a),
          ),
        ).toContainEqual(expected);
      });
    });
  }

  it("control: negative growth, indexation, inflation and shock deltas are accepted", () => {
    const a: Assumptions = {
      ...assumptions,
      appreciationPa: rate("-0.02"),
      rentIndexationPa: rate("-0.01"),
      inflationPa: rate("-0.005"),
      inflationShock: { deltaPa: rate("-0.02"), durationYears: 5 },
      rateShock: { deltaPa: rate("-0.01"), durationYears: 0 },
      valueShock: { pct: rate("1"), atYear: 0 },
      acquisitionCostPct: rate("1"),
    };
    for (const run of Object.values(entryPoints(portfolio, a))) {
      expect(run).not.toThrow();
    }
  });
});

// ADR 0075 (DR-176): a negative cost default is rejected like a negative override (D-54).
describe("negative cost defaults raise at every entry point", () => {
  for (const field of [
    "propertyTaxYr",
    "insuranceYr",
    "svjMonthly",
    "otherYr",
  ] as const) {
    describe(field, () => {
      const a: Assumptions = {
        ...assumptions,
        defaults: { ...assumptions.defaults, [field]: money(-1) },
      };
      const expected = {
        code: "NEGATIVE_AMOUNT",
        entity: "assumptions",
        field: `defaults.${field}`,
      };
      for (const [entry, run] of Object.entries(entryPoints(portfolio, a))) {
        it(entry, () => {
          expect(errorsOf(run)).toContainEqual(expected);
        });
      }
      it("schedulesByProperty", () => {
        expect(
          errorsOf(() =>
            schedulesByProperty(portfolio.mortgages, ids(portfolio), a),
          ),
        ).toContainEqual(expected);
      });
    });
  }

  it("control: zero cost defaults are accepted", () => {
    const zero = money(0);
    const a: Assumptions = {
      ...assumptions,
      defaults: {
        ...assumptions.defaults,
        propertyTaxYr: zero,
        insuranceYr: zero,
        svjMonthly: zero,
        otherYr: zero,
      },
    };
    for (const run of Object.values(entryPoints(portfolio, a))) {
      expect(run).not.toThrow();
    }
  });
});

// ADR 0075 (DR-115): HORIZON_NOT_POSITIVE is the error every public entry point that takes
// assumptions raises for a bad horizon, before anything indexes by it (never the checked
// at()'s "Engine invariant broken").
describe("an invalid horizon raises HORIZON_NOT_POSITIVE first", () => {
  const expected = {
    code: "HORIZON_NOT_POSITIVE",
    entity: "assumptions",
    field: "horizonYears",
  };
  const later = isoDate("2031-06-07");
  for (const horizonYears of [0, -1, 1.5]) {
    describe(`horizonYears ${horizonYears}`, () => {
      const a: Assumptions = { ...assumptions, horizonYears };
      const entries = {
        ...entryPoints(portfolio, a),
        portfolioOutputs: () => portfolioOutputs(portfolio, a),
        projectionAndKpis: () => projectionAndKpis(portfolio, a),
        schedulesByProperty: () =>
          schedulesByProperty(portfolio.mortgages, ids(portfolio), a),
        cpiIndex: () => cpiIndex(a),
        cpiAt: () => cpiAt(a, later),
      };
      for (const [entry, run] of Object.entries(entries)) {
        it(entry, () => {
          expect(errorsOf(run)).toContainEqual(expected);
        });
      }
    });
  }
});
