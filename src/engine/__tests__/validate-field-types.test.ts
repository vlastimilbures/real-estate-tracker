// A validation error names a field of its own entity (ADR 0251 §4): `field` is typed
// per entity, and every field the validators report is one VALIDATION_FIELDS lists.
import { describe, expect, expectTypeOf, it } from "vitest";
import { money, rate } from "../brands";
import { isoDate } from "../dates";
import { COST_KEYS } from "../figures";
import { derivedTermProblem } from "../amortization";
import { validateInputs } from "../validate";
import {
  VALIDATION_FIELDS,
  type EngineValidationError,
  type FieldOf,
  type ValidationEntity,
  type ValidationField,
} from "../validate/codes";
import type { Assumptions, IsoDate, Portfolio } from "../types";
import { assumptions, portfolio } from "./support/seed";
import { devBlock } from "./support/mixed";

const bad = new Date(NaN) as IsoDate;
const nan = money(NaN);

describe("the field types (ADR 0251 §4)", () => {
  it("an error's field is a ValidationField, the union of every entity's fields", () => {
    expectTypeOf<EngineValidationError["field"]>().toEqualTypeOf<
      ValidationField | undefined
    >();
    expectTypeOf<FieldOf<"valuation">>().toEqualTypeOf<
      "propertyId" | "validFrom" | "validTo" | "marketValue"
    >();
    expectTypeOf<
      NonNullable<ReturnType<typeof derivedTermProblem>>["field"]
    >().toEqualTypeOf<"loanTermYears" | "monthlyInstalment">();
    // A misspelt field does not compile.
    const misspelt: EngineValidationError = {
      code: "NEGATIVE_AMOUNT",
      entity: "lease",
      // @ts-expect-error: not a field any entity names
      field: "monthlyRnet",
    };
    expect(misspelt.entity).toBe("lease");
  });

  it("the cost fields are the holding-cost keys, bare and behind defaults.", () => {
    const keys = [...COST_KEYS].sort();
    expect(
      VALIDATION_FIELDS.holdingCost.filter((f) => f !== "propertyId").sort(),
    ).toEqual(keys);
    const a: readonly string[] = VALIDATION_FIELDS.assumptions;
    for (const k of keys) {
      expect(a).toContain(k); // NON_FINITE_NUMBER, parked P3
      expect(a).toContain(`defaults.${k}`);
    }
  });
});

/** A portfolio and assumptions with one kind of problem each. */
type Probe = { p?: Partial<Portfolio>; a?: Partial<Assumptions> };

const [prop] = portfolio.properties;
const [mortgage] = portfolio.mortgages;
const [valuation] = portfolio.valuations;
const [lease] = portfolio.leases;
const [holding] = portfolio.holdingCosts;

const withMortgage = (m: object): Probe => ({
  p: { mortgages: [{ ...mortgage!, ...m } as typeof mortgage & object] },
});

const PROBES: Probe[] = [
  // Every assumption number non-finite, the base date invalid, the horizon 0.
  {
    a: {
      baseDate: bad,
      appreciationPa: rate(NaN),
      rentIndexationPa: rate(NaN),
      vacancyAllowance: rate(NaN),
      postFixationResetRatePa: rate(NaN),
      inflationPa: rate(NaN),
      sellingCostPct: rate(NaN),
      horizonYears: 0,
      defaults: Object.fromEntries(
        COST_KEYS.map((k) => [k, nan]),
      ) as unknown as Assumptions["defaults"],
      inflationShock: { deltaPa: rate(NaN), durationYears: 1 },
      rateShock: { deltaPa: rate(NaN), durationYears: 1 },
      valueShock: { pct: rate(NaN), atYear: 1 },
    },
  },
  // Every default out of its range.
  {
    a: {
      defaults: Object.fromEntries(
        COST_KEYS.map((k) => [k, money(-2)]),
      ) as unknown as Assumptions["defaults"],
    },
  },
  {
    p: {
      properties: [
        {
          ...prop!,
          purchaseDate: bad,
          purchasePrice: nan,
          appreciationOverridePa: rate(NaN),
          rentIndexOverridePa: rate(NaN),
          funding: { ownCash: nan, transactionCosts: nan, initialWorks: nan },
        },
      ],
    },
  },
  withMortgage({
    propertyId: "nowhere",
    startDate: bad,
    completionDate: bad,
    contractMaturityDate: bad,
    initialPrincipal: nan,
    interestRatePa: rate(NaN),
    monthlyInstalment: nan,
    fixationYears: 1.5,
    loanTermYears: 0,
  }),
  withMortgage({
    ...devBlock,
    draws: [{ date: isoDate("2026-11-15"), amount: nan }],
    prepayments: [
      { date: isoDate("2027-01-17"), amount: nan, effect: "lowerInstalment" },
    ],
    recasts: [{ date: isoDate("2028-01-17"), instalment: nan }],
  }),
  {
    p: {
      valuations: [
        {
          ...valuation!,
          propertyId: "nowhere",
          validFrom: bad,
          validTo: bad,
          marketValue: nan,
        },
      ],
      leases: [
        {
          ...lease!,
          propertyId: "nowhere",
          startDate: bad,
          endDate: bad,
          monthlyRent: nan,
        },
      ],
      holdingCosts: [
        {
          ...holding!,
          propertyId: "nowhere",
          ...Object.fromEntries(COST_KEYS.map((k) => [k, nan])),
        },
      ],
    },
  },
];

describe("every reported field is its entity's (ADR 0251 §4)", () => {
  it("the probes name every listed field, and only listed fields", () => {
    const seen = new Map<ValidationEntity, Set<string>>();
    const asOf = isoDate("2020-01-01"); // before the base date: ASOF_BEFORE_BASEDATE
    for (const { p, a } of PROBES) {
      const errors = validateInputs(
        { ...portfolio, ...p },
        { ...assumptions, ...a },
        asOf,
      );
      for (const e of errors) {
        if (e.field === undefined) continue;
        const own: readonly string[] = VALIDATION_FIELDS[e.entity];
        expect(own, `${e.entity} ${e.code}`).toContain(e.field);
        seen.set(e.entity, (seen.get(e.entity) ?? new Set()).add(e.field));
      }
    }
    for (const entity of Object.keys(VALIDATION_FIELDS) as ValidationEntity[])
      expect([...(seen.get(entity) ?? [])].sort(), entity).toEqual(
        [...VALIDATION_FIELDS[entity]].sort(),
      );
  });
});
