// P3 property-based tests (fast-check, dev-only). Random VALID loans and effective-dated
// record sets must satisfy the invariants; the annuity helpers must round-trip; nothing
// may produce NaN/Infinity for valid input. Invalid loans raise a typed EngineInputError
// (D-17); invalid assumptions still assert TODAY's behaviour with a DR reference.
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { termMonths } from "../amortization";
import { EngineInputError } from "../errors";
import { buildSchedule, schedulesByProperty } from "../schedule";
import {
  propertySnapshot,
  leaseInForce,
  selectValuation,
  valuationInForce,
} from "../metrics";
import { propertyProjection } from "../projections";
import { portfolioKpis } from "../kpis";
import { edate, isAfter, isOnOrBefore, utc } from "../dates";
import { D, FV, NPER, PMT, ZERO, ceilCzk, type Decimal } from "../../lib/money";
import type {
  Assumptions,
  Lease,
  MortgageBlock,
  Portfolio,
  Property,
  Valuation,
} from "../types";
import { validateInputs } from "../validate";
import {
  assumptions,
  BASE_DATE,
  portfolio as seedPortfolio,
} from "./support/seed";
import { KC, near } from "./support/tolerance";
import { rate as brandRate, type IsoDate, type Rate } from "../brands";
import { money } from "../brands";

// Fixed seed ⇒ reproducible in CI. Hunt locally with FC_SEED=<n> FC_RUNS=<n>.
const RUNS = {
  seed: Number(process.env.FC_SEED ?? 20260930),
  numRuns: Number(process.env.FC_RUNS ?? 120),
};

// Time budget for the heavy random-loan properties: each run builds a schedule of up to 480 rows and
// projects it, ~1 s per test locally but past the 5 s default on CI runners under v8 coverage.
// A time budget only — the checks and run count are unchanged.
const HEAVY_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** A UTC calendar date within ±`spanDays` of baseDate. */
const dateAround = (fromDays: number, toDays: number) =>
  fc
    .integer({ min: fromDays, max: toDays })
    .map((d) => new Date(BASE_DATE.getTime() + d * 86_400_000) as IsoDate);

/** A valid plain annuity loan: rate 0–15 %, principal 100 k–20 M Kč, and an instalment
 *  (whole Kč, rounded up) that amortizes it within 12–480 months. */
const plainLoan = fc
  .record({
    bp: fc.integer({ min: 0, max: 1500 }),
    principal: fc.integer({ min: 100_000, max: 20_000_000 }),
    months: fc.integer({ min: 12, max: 480 }),
    fixationYears: fc.integer({ min: 1, max: 10 }),
    start: dateAround(-20 * 365, 5 * 365),
  })
  .map(({ bp, principal, months, fixationYears, start }) => {
    const rate = D(bp).div(10_000);
    const P = money(principal);
    const block: MortgageBlock = {
      id: "m",
      propertyId: "p",
      startDate: start,
      initialPrincipal: P,
      fixationYears,
      interestRatePa: rate as Rate,
      monthlyInstalment: money(ceilCzk(PMT(rate.div(12), months, P.negated()))),
    };
    return { block, months };
  });

function onePropertyPortfolio(block: MortgageBlock): {
  portfolio: Portfolio;
  property: Property;
} {
  const property: Property = {
    id: "p",
    name: "P",
    purchaseDate: block.startDate,
    purchasePrice: money(block.initialPrincipal.times(1.4)),
  };
  return {
    property,
    portfolio: {
      properties: [property],
      mortgages: [block],
      valuations: [
        {
          id: "v",
          propertyId: "p",
          validFrom: block.startDate,
          marketValue: money(block.initialPrincipal.times(1.5)),
        },
      ],
      leases: [
        {
          id: "l",
          propertyId: "p",
          startDate: block.startDate,
          monthlyRent: money(25_000),
        },
      ],
      holdingCosts: [],
    },
  };
}

const finite = (d: Decimal | null) => d === null || d.isFinite();

// ---------------------------------------------------------------------------
// Annuity helpers
// ---------------------------------------------------------------------------

describe("PMT / FV / NPER round-trip", () => {
  it("NPER(PMT(r, n, P)) = n and FV after n payments = 0", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1500 }), // bp > 0 (r = 0 has its own branch below)
        fc.integer({ min: 1, max: 600 }),
        fc.integer({ min: 1_000, max: 50_000_000 }),
        (bp, n, principal) => {
          const r = D(bp).div(120_000); // monthly rate
          const pmt = PMT(r, n, principal);
          expect(NPER(r, pmt, principal).minus(n).abs().lt(1e-9)).toBe(true);
          expect(FV(r, n, pmt, principal).abs().lt(1e-6)).toBe(true);
        },
      ),
      RUNS,
    );
  });

  it("at r = 0 the helpers degrade to straight-line", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 600 }),
        fc.integer({ min: 1_000, max: 50_000_000 }),
        (n, principal) => {
          const pmt = PMT(0, n, principal);
          near(pmt.negated().times(n), principal, 1e-9, "pmt×n");
          near(NPER(0, pmt, principal), n, 1e-9, "nper");
          near(FV(0, n, pmt, principal), 0, 1e-9, "fv");
        },
      ),
      RUNS,
    );
  });
});

// ---------------------------------------------------------------------------
// Random valid loans
// ---------------------------------------------------------------------------

describe("random valid plain loans", { timeout: HEAVY_TIMEOUT_MS }, () => {
  it("term is finite and within the 12–480-month design range", () => {
    fc.assert(
      fc.property(plainLoan, ({ block, months }) => {
        const term = termMonths(block);
        expect(Number.isFinite(term)).toBe(true);
        // Instalment rounded UP ⇒ never longer than the design term.
        expect(term).toBeLessThanOrEqual(months);
        expect(term).toBeGreaterThan(0);
      }),
      RUNS,
    );
  });

  it("schedule: finite numbers, balance ≥ 0, repays fully, Σ principal = opening + new loan", () => {
    fc.assert(
      fc.property(plainLoan, ({ block }) => {
        const rows = buildSchedule(block, assumptions);
        const future = isAfter(block.startDate, assumptions.baseDate);
        for (const r of rows) {
          for (const d of [
            r.instalment,
            r.interest,
            r.principal,
            r.endBalance,
            r.ratePa,
          ])
            expect(d.isFinite()).toBe(true);
          expect(r.endBalance.gte(ZERO)).toBe(true);
          expect(r.principal.gte(ZERO)).toBe(true);
        }
        if (rows.length === 0) return;
        const opening = future
          ? ZERO
          : rows[0].endBalance.plus(rows[0].principal);
        const newDebt = future ? block.initialPrincipal : ZERO;
        const sumP = rows.reduce((s, r) => s.plus(r.principal), ZERO);
        near(rows.at(-1)!.endBalance, 0, KC, "final balance");
        near(sumP, opening.plus(newDebt).toNumber(), KC, "Σ principal");
      }),
      RUNS,
    );
  });

  it("projection: no NaN/Infinity, horizon conservation, snapshot == projection for debt", () => {
    fc.assert(
      fc.property(plainLoan, ({ block }) => {
        const { portfolio, property } = onePropertyPortfolio(block);
        const sched = schedulesByProperty(
          portfolio.mortgages,
          ["p"],
          assumptions,
        ).get("p")!;
        const proj = propertyProjection(
          property,
          portfolio,
          assumptions,
          sched,
        );
        for (const y of proj)
          for (const v of Object.values(y))
            if (v instanceof Date)
              expect(Number.isNaN(v.getTime())).toBe(false); // D-22 periods
            else if (typeof v === "object")
              expect(finite(v as Decimal | null)).toBe(true);
        const N = assumptions.horizonYears;
        const end = edate(assumptions.baseDate, N * 12);
        const newDebt =
          isAfter(block.startDate, assumptions.baseDate) &&
          isOnOrBefore(block.startDate, end)
            ? block.initialPrincipal
            : ZERO;
        const sumP = proj.slice(1).reduce((s, y) => s.plus(y.principal), ZERO);
        near(
          sumP,
          proj[0].balance.plus(newDebt).minus(proj[N].balance).toNumber(),
          KC,
          "Σ",
        );
        for (const n of [0, 1, 5, 15, N]) {
          const s = propertySnapshot(
            property,
            portfolio,
            assumptions,
            edate(assumptions.baseDate, n * 12),
            sched,
          );
          // Pre-purchase years are outside the invariant (see DR-106 in characterisation).
          if (s.owned)
            near(s.debt, proj[n].balance.toNumber(), KC, `debt N=${n}`);
        }
        const k = portfolioKpis(portfolio, assumptions);
        // D-34, ADR 0126: the multiples are null exactly when equity₀ ≤ 0, a CAGR also
        // when its end net worth ≤ 0; every KPI present is finite.
        const noGrowthBase = !proj[0].equity.greaterThan(ZERO);
        expect(k.netWorthMultiple === null, "multiple null").toBe(noGrowthBase);
        expect(k.netWorthMultipleReal === null, "real multiple null").toBe(
          noGrowthBase,
        );
        expect(k.cagrNominal === null, "cagrNominal null").toBe(
          noGrowthBase || !k.netWorthNominal.greaterThan(ZERO),
        );
        expect(k.cagrReal === null, "cagrReal null").toBe(
          noGrowthBase || !k.netWorthReal.greaterThan(ZERO),
        );
        for (const [key, v] of Object.entries(k)) {
          if (v !== null && typeof v === "object")
            expect((v as Decimal).isFinite(), key).toBe(true);
        }
      }),
      { ...RUNS, numRuns: Math.ceil(RUNS.numRuns / 2) },
    );
  });
});

// ---------------------------------------------------------------------------
// Effective-dated record sets
// ---------------------------------------------------------------------------

/** Distinct start offsets (days) so "latest start" is unambiguous. */
const records = fc.uniqueArray(
  fc.record({
    startDay: fc.integer({ min: -2000, max: 2000 }),
    lengthDays: fc.option(fc.integer({ min: 0, max: 1500 }), {
      nil: undefined,
    }),
    amount: fc.integer({ min: 1_000, max: 100_000 }),
  }),
  { selector: (r) => r.startDay, minLength: 0, maxLength: 8 },
);

const dayToDate = (d: number) =>
  new Date(BASE_DATE.getTime() + d * 86_400_000) as IsoDate;

/** Brute-force oracle: the record with the latest start ≤ asOf whose end is blank or ≥ asOf. */
function oracle<T extends { id: string }>(
  xs: T[],
  asOf: Date,
  start: (x: T) => Date,
  end: (x: T) => Date | undefined,
): string | undefined {
  let best: T | undefined;
  for (const x of xs) {
    const e = end(x);
    if (start(x) > asOf || (e !== undefined && asOf > e)) continue;
    if (!best || start(x) > start(best)) best = x;
  }
  return best?.id;
}

describe("random effective-dated leases and valuations", () => {
  it("leaseInForce / valuationInForce pick the record in force at asOf", () => {
    fc.assert(
      fc.property(
        records,
        fc.integer({ min: -2500, max: 2500 }),
        (rs, asOfDay) => {
          const asOf = dayToDate(asOfDay);
          const leases: Lease[] = rs.map((r, i) => ({
            id: `l${i}`,
            propertyId: "p",
            startDate: dayToDate(r.startDay),
            endDate:
              r.lengthDays === undefined
                ? undefined
                : dayToDate(r.startDay + r.lengthDays),
            monthlyRent: money(r.amount),
          }));
          const vals: Valuation[] = rs.map((r, i) => ({
            id: `v${i}`,
            propertyId: "p",
            validFrom: dayToDate(r.startDay),
            validTo:
              r.lengthDays === undefined
                ? undefined
                : dayToDate(r.startDay + r.lengthDays),
            marketValue: money(r.amount * 100),
          }));
          expect(leaseInForce(leases, asOf)?.id).toBe(
            oracle(
              leases,
              asOf,
              (l) => l.startDate,
              (l) => l.endDate,
            ),
          );
          expect(valuationInForce(vals, asOf)?.id).toBe(
            oracle(
              vals,
              asOf,
              (v) => v.validFrom,
              (v) => v.validTo,
            ),
          );
        },
      ),
      RUNS,
    );
  });

  it("selectValuation: latest started (validTo not read), else nearest upcoming (ADR 0122)", () => {
    fc.assert(
      fc.property(records, fc.integer({ min: 0, max: 2500 }), (rs, asOfDay) => {
        const asOf = dayToDate(asOfDay);
        const vals: Valuation[] = rs.map((r, i) => ({
          id: `v${i}`,
          propertyId: "p",
          validFrom: dayToDate(r.startDay),
          validTo:
            r.lengthDays === undefined
              ? undefined
              : dayToDate(r.startDay + r.lengthDays),
          marketValue: money(r.amount * 100),
        }));
        const from = (v: Valuation) => v.validFrom;
        const upcoming = vals
          .filter((v) => v.validFrom > asOf)
          .sort((a, b) => a.validFrom.getTime() - b.validFrom.getTime())[0];
        expect(selectValuation(vals, asOf)?.id).toBe(
          oracle(vals, asOf, from, () => undefined) ?? upcoming?.id,
        );
        // The purchase price (1 Kč here) stands in only when there is no valuation.
        const property: Property = {
          id: "p",
          name: "P",
          purchaseDate: utc(2020, 1, 1),
          purchasePrice: money(1),
        };
        const p: Portfolio = {
          properties: [property],
          mortgages: [],
          valuations: vals,
          leases: [],
          holdingCosts: [],
        };
        const value = propertySnapshot(property, p, assumptions, asOf).value;
        expect(value.greaterThanOrEqualTo(100_000)).toBe(vals.length > 0);
      }),
      RUNS,
    );
  });

  it("snapshot gross rent = 12 × the lease in force (0 in a gap, no fallback)", () => {
    fc.assert(
      fc.property(records, fc.integer({ min: 0, max: 2500 }), (rs, asOfDay) => {
        const leases: Lease[] = rs.map((r, i) => ({
          id: `l${i}`,
          propertyId: "p",
          startDate: dayToDate(r.startDay),
          endDate:
            r.lengthDays === undefined
              ? undefined
              : dayToDate(r.startDay + r.lengthDays),
          monthlyRent: money(r.amount),
        }));
        const property: Property = {
          id: "p",
          name: "P",
          purchaseDate: utc(2020, 1, 1),
          purchasePrice: money(5_000_000),
        };
        const p: Portfolio = {
          properties: [property],
          mortgages: [],
          valuations: [],
          leases,
          holdingCosts: [],
        };
        const asOf = dayToDate(asOfDay);
        const s = propertySnapshot(property, p, assumptions, asOf);
        const inForce = leaseInForce(leases, asOf);
        near(
          s.grossAnnualRent,
          inForce ? inForce.monthlyRent.toNumber() * 12 : 0,
          0,
          "rent",
        );
        expect(
          [s.value, s.noi, s.netCashFlow, s.grossYield].every((d) =>
            d.isFinite(),
          ),
        ).toBe(true);
      }),
      RUNS,
    );
  });
});

// ---------------------------------------------------------------------------
// Invalid input — loans raise a typed error (D-17); horizon 0 is today's behaviour
// ---------------------------------------------------------------------------

const codeOf = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (e) {
    return e instanceof EngineInputError ? e.errors[0]?.code : "untyped";
  }
  return undefined;
};

describe("invalid loans — typed errors (D-17)", () => {
  it("instalment below the first month's interest ⇒ INSTALMENT_BELOW_INTEREST (DR-014)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 1500 }),
        fc.integer({ min: 1_000_000, max: 20_000_000 }),
        fc.double({ min: 0.01, max: 0.99, noNaN: true }),
        (bp, principal, share) => {
          const rate = D(bp).div(10_000);
          const interest = D(principal).times(rate).div(12);
          const block: MortgageBlock = {
            id: "bad",
            propertyId: "p",
            startDate: utc(2025, 1, 15),
            initialPrincipal: money(principal),
            fixationYears: 5,
            interestRatePa: rate as Rate,
            monthlyInstalment: money(interest.times(share).floor()),
          };
          expect(codeOf(() => termMonths(block))).toBe(
            "INSTALMENT_BELOW_INTEREST",
          );
          expect(codeOf(() => buildSchedule(block, assumptions))).toBe(
            "INSTALMENT_BELOW_INTEREST",
          );
        },
      ),
      RUNS,
    );
  });

  it("0 % rate with a 0 instalment ⇒ ZERO_RATE_ZERO_INSTALMENT, no endless loop (DR-018)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 20_000_000 }), (principal) => {
        const block: MortgageBlock = {
          id: "zero",
          propertyId: "p",
          startDate: utc(2025, 1, 15),
          initialPrincipal: money(principal),
          fixationYears: 5,
          interestRatePa: ZERO as Rate,
          monthlyInstalment: money(0),
        };
        expect(codeOf(() => termMonths(block))).toBe(
          "ZERO_RATE_ZERO_INSTALMENT",
        );
        expect(codeOf(() => buildSchedule(block, assumptions))).toBe(
          "ZERO_RATE_ZERO_INSTALMENT",
        );
      }),
      RUNS,
    );
  });

  it("development loan without loanTermYears ⇒ MISSING_TERM_FOR_DEV_LOAN (DR-043)", () => {
    const block = {
      id: "dev",
      propertyId: "p",
      startDate: utc(2025, 1, 15),
      initialPrincipal: money(1_000_000),
      fixationYears: 5,
      interestRatePa: brandRate("0.05"),
      monthlyInstalment: money(5_000),
      draws: [{ date: utc(2027, 1, 1), amount: money(500_000) }],
    } as unknown as MortgageBlock; // deliberately invalid (DR-051)
    expect(codeOf(() => termMonths(block))).toBe("MISSING_TERM_FOR_DEV_LOAN");
    expect(codeOf(() => buildSchedule(block, assumptions))).toBe(
      "MISSING_TERM_FOR_DEV_LOAN",
    );
  });

  it("horizonYears = 0 ⇒ HORIZON_NOT_POSITIVE (D-38, was NaN CAGR — DR-043)", () => {
    const a: Assumptions = { ...assumptions, horizonYears: 0 };
    const { portfolio } = onePropertyPortfolio({
      id: "m",
      propertyId: "p",
      startDate: utc(2020, 1, 15),
      initialPrincipal: money(2_000_000),
      fixationYears: 5,
      interestRatePa: brandRate("0.03"),
      monthlyInstalment: money(12_000),
    });
    expect(codeOf(() => portfolioKpis(portfolio, a))).toBe(
      "HORIZON_NOT_POSITIVE",
    );
  });
});

// ---------------------------------------------------------------------------
// R2-12 (ADR 0128): random valid assumptions, shocks and horizon
// ---------------------------------------------------------------------------

/** A ratio from whole basis points (exact in decimal). */
const bp = (n: number) => brandRate(D(n).div(10_000));

/** Growth, indexation and inflation: above −100 % (ADR 0128), up to +50 %. */
const growthBp = fc.integer({ min: -9_999, max: 5_000 });

/** A shock band drawn as the shocked level (bp) it gives, held for 0–10 years. */
const band = (shockedBp: fc.Arbitrary<number>) =>
  fc.option(
    fc.record({ shocked: shockedBp, years: fc.integer({ min: 0, max: 10 }) }),
    { nil: undefined },
  );

/** Valid assumptions on the seed portfolio: every level, shock, crash and property
 *  override drawn from the ranges ADR 0038 / ADR 0128 allow, horizon 1–50 years. */
const validInputs = fc
  .record({
    appreciation: growthBp,
    indexation: growthBp,
    inflation: growthBp,
    vacancy: fc.integer({ min: 0, max: 10_000 }),
    reset: fc.integer({ min: 0, max: 10_000 }),
    horizon: fc.integer({ min: 1, max: 50 }),
    // Shocked reset rate within [0, 1]; shocked inflation above −1 (ADR 0128 §3).
    rateShock: band(fc.integer({ min: 0, max: 10_000 })),
    inflationShock: band(growthBp),
    crash: fc.option(
      fc.record({
        pct: fc.integer({ min: 0, max: 10_000 }),
        year: fc.integer({ min: 0, max: 50 }),
      }),
      { nil: undefined },
    ),
    appreciationOverride: fc.option(growthBp, { nil: undefined }),
    rentIndexOverride: fc.option(growthBp, { nil: undefined }),
  })
  .map((r) => {
    // The delta is the shocked level minus the level, so the shocked level is in range.
    const rateDelta = (shocked: number) => shocked - r.reset;
    const inflationDelta = (shocked: number) => shocked - r.inflation;
    const a: Assumptions = {
      ...assumptions,
      appreciationPa: bp(r.appreciation),
      rentIndexationPa: bp(r.indexation),
      inflationPa: bp(r.inflation),
      vacancyAllowance: bp(r.vacancy),
      postFixationResetRatePa: bp(r.reset),
      horizonYears: r.horizon,
      ...(r.rateShock && {
        rateShock: {
          deltaPa: bp(rateDelta(r.rateShock.shocked)),
          durationYears: r.rateShock.years,
        },
      }),
      ...(r.inflationShock && {
        inflationShock: {
          deltaPa: bp(inflationDelta(r.inflationShock.shocked)),
          durationYears: r.inflationShock.years,
        },
      }),
      ...(r.crash && {
        // Any year from today to the horizon.
        valueShock: {
          pct: bp(r.crash.pct),
          atYear: r.crash.year % (r.horizon + 1),
        },
      }),
    };
    const [p0, ...ps] = seedPortfolio.properties;
    const portfolio: Portfolio = {
      ...seedPortfolio,
      properties: [
        {
          ...p0!,
          ...(r.appreciationOverride !== undefined && {
            appreciationOverridePa: bp(r.appreciationOverride),
          }),
          ...(r.rentIndexOverride !== undefined && {
            rentIndexOverridePa: bp(r.rentIndexOverride),
          }),
        },
        ...ps,
      ],
    };
    return { a, portfolio };
  });

describe(
  "random valid assumptions, shocks and horizon (R2-12, ADR 0128)",
  { timeout: HEAVY_TIMEOUT_MS },
  () => {
    it("every input passes validation and every KPI present is finite", () => {
      fc.assert(
        fc.property(validInputs, ({ a, portfolio }) => {
          expect(validateInputs(portfolio, a)).toEqual([]);
          const k = portfolioKpis(portfolio, a);
          for (const [key, v] of Object.entries(k)) {
            if (v !== null && typeof v === "object")
              expect((v as Decimal).isFinite(), key).toBe(true);
          }
        }),
        { ...RUNS, numRuns: Math.ceil(RUNS.numRuns / 4) },
      );
    });
  },
);
