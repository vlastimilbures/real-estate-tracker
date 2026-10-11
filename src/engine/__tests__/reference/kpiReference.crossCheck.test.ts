// ADR 0174 (#160): the engine-free KPI model against the parity targets (the independent
// check of the sample portfolio) and against the engine, year by year and KPI by KPI, on
// the seed and on the seed with a prepayment and a recast.
import { describe, it, expect } from "vitest";
import { portfolioProjection } from "../../projections";
import { portfolioKpis } from "../../kpis";
import { isoDate } from "../../dates";
import { money, rate } from "../../brands";
import type {
  Assumptions,
  MortgageBlock,
  Portfolio,
  PortfolioKPIs,
  ProjectionYear,
} from "../../types";
import { assumptions, PARITY, portfolio, RATIO_KEYS } from "../support/seed";
import { KC, RATIO } from "../support/tolerance";
import { TIGHT } from "./eventHarness";
import { Dec, type RefLoan } from "./mortgageReference";
import {
  referenceIrr,
  referenceKpis,
  referenceProjection,
  type RefAssumptions,
  type RefProperty,
  type RefYear,
} from "./kpiReference";
import { SEED_LOANS } from "./seedLoans";

const iso = (x: Date) => x.toISOString().slice(0, 10);
const str = (x: { toString(): string } | undefined) => x?.toString();
/** Rates, CAGR and IRR: far inside the ±0.0001 parity tolerance. */
const RATE_TIGHT = 1e-9;

/** Copies fields only: costs as entered (the model applies the defaults itself), and every
 *  field the model does not handle is passed on, so the model throws on it. */
function fromEngine(
  p: Portfolio,
  a: Assumptions,
): { props: RefProperty[]; a: RefAssumptions } {
  const of = <T extends { propertyId: string }>(rows: T[], id: string) =>
    rows.filter((r) => r.propertyId === id);
  const props = p.properties.map((x): RefProperty => {
    const costs = of(p.holdingCosts, x.id)[0];
    const unsupported = [
      x.active === false && "an inactive property",
      x.appreciationOverridePa && "a growth override",
      x.rentIndexOverridePa && "a rent index override",
      x.funding && "a funding record",
    ].filter((s): s is string => typeof s === "string");
    return {
      id: x.id,
      purchaseDate: iso(x.purchaseDate),
      valuations: of(p.valuations, x.id).map((v) => ({
        validFrom: iso(v.validFrom),
        ...(v.validTo ? { validTo: iso(v.validTo) } : {}),
        marketValue: v.marketValue.toString(),
      })),
      leases: of(p.leases, x.id).map((l) => ({
        start: iso(l.startDate),
        ...(l.endDate ? { end: iso(l.endDate) } : {}),
        monthlyRent: l.monthlyRent.toString(),
      })),
      costs: Object.fromEntries(
        (
          [
            "propertyTaxYr",
            "insuranceYr",
            "mgmtPctRent",
            "maintPctRent",
            "svjMonthly",
            "otherYr",
          ] as const
        )
          .filter((k) => costs?.[k] !== undefined)
          .map((k) => [k, str(costs?.[k])!]),
      ),
      loans: of(p.mortgages, x.id).map(toRefLoan),
      unsupported,
    };
  });
  const unsupported = [
    a.acquisitionCostPct && "acquisition costs",
    a.inflationShock && "an inflation shock",
    a.rateShock && "a rate shock",
    a.valueShock && "a value shock",
  ].filter((s): s is string => typeof s === "string");
  const dft = a.defaults;
  return {
    props,
    a: {
      baseDate: iso(a.baseDate),
      appreciationPa: a.appreciationPa.toString(),
      rentIndexationPa: a.rentIndexationPa.toString(),
      vacancyAllowance: a.vacancyAllowance.toString(),
      resetRatePa: a.postFixationResetRatePa.toString(),
      horizonYears: a.horizonYears,
      inflationPa: a.inflationPa.toString(),
      defaults: {
        propertyTaxYr: dft.propertyTaxYr.toString(),
        insuranceYr: dft.insuranceYr.toString(),
        mgmtPctRent: dft.mgmtPctRent.toString(),
        maintPctRent: dft.maintPctRent.toString(),
        svjMonthly: dft.svjMonthly.toString(),
        otherYr: dft.otherYr.toString(),
      },
      unsupported,
    },
  };
}

function toRefLoan(m: MortgageBlock): RefLoan {
  return {
    start: iso(m.startDate),
    principal: m.initialPrincipal.toString(),
    ratePa: m.interestRatePa.toString(),
    instalment: m.monthlyInstalment.toString(),
    fixationMonths: m.fixationYears * 12,
    ...(m.loanTermYears ? { termMonths: m.loanTermYears * 12 } : {}),
    ...(m.draws
      ? {
          draws: m.draws.map((x) => ({
            date: iso(x.date),
            amount: x.amount.toString(),
          })),
        }
      : {}),
    ...(m.completionDate ? { completion: iso(m.completionDate) } : {}),
    ...(m.prepayments
      ? {
          prepayments: m.prepayments.map((x) => ({
            date: iso(x.date),
            amount: x.amount.toString(),
            effect: x.effect,
            ...(x.fee ? { fee: x.fee.toString() } : {}),
          })),
        }
      : {}),
    ...(m.recasts
      ? {
          recasts: m.recasts.map((r) =>
            r.maturity
              ? { date: iso(r.date), maturity: iso(r.maturity) }
              : { date: iso(r.date), instalment: str(r.instalment)! },
          ),
        }
      : {}),
  };
}

const COLS = [
  "value",
  "balance",
  "equity",
  "grossRent",
  "effectiveRent",
  "holdingCosts",
  "noi",
  "interest",
  "principal",
  "debtService",
  "netCashFlow",
  "prepaid",
  "prepaymentFees",
  "cashToOwner",
] as const satisfies readonly (keyof RefYear & keyof ProjectionYear)[];

const MONEY_KPIS = [
  "netWorthNominal",
  "netWorthReal",
  "cumulativeNetCashFlow",
  "cumulativeNetCashFlowReal",
  "totalPrincipalRepaid",
  "totalInterest",
  "totalInterestReal",
] as const;
const RATE_KPIS = [
  "netWorthMultiple",
  "netWorthMultipleReal",
  "cagrNominal",
  "cagrReal",
  "leveredIrrNominal",
  "leveredIrrReal",
] as const;
const YEAR_KPIS = [
  "firstCashFlowPositiveYear",
  "firstCashFlowPositiveProjectionYear",
  "debtFreeYear",
  "debtFreeProjectionYear",
] as const;

const gap = (
  x: { toString(): string } | null,
  y: { toString(): string } | null,
) => Math.abs(Number(x?.toString()) - Number(y?.toString()));

/** Engine and reference agree per year (every column) and per KPI. */
function expectEngineMatches(p: Portfolio) {
  const ref = fromEngine(p, assumptions);
  const ys = referenceProjection(ref.props, ref.a);
  const engine = portfolioProjection(p, assumptions);
  expect(engine).toHaveLength(ys.length);
  engine.forEach((e, t) => {
    const r = ys[t]!;
    expect(e.calendarYear).toBe(r.calendarYear);
    for (const c of COLS)
      expect(gap(e[c], r[c]), `year ${t} ${c}`).toBeLessThanOrEqual(TIGHT);
  });
  const k: PortfolioKPIs = portfolioKpis(p, assumptions);
  const rk = referenceKpis(ref.props, ref.a);
  for (const c of MONEY_KPIS)
    expect(gap(k[c], rk[c]), c).toBeLessThanOrEqual(TIGHT);
  for (const c of RATE_KPIS)
    expect(gap(k[c], rk[c]), c).toBeLessThanOrEqual(RATE_TIGHT);
  for (const c of YEAR_KPIS) expect(k[c], c).toBe(rk[c]);
  return { ys, rk };
}

/** The seed with Javorová prepaying 500 000 Kč (+ 2 000 Kč fee) on its 2031 refix and
 *  recasting to a 2042 maturity in 2036 (ADR 0109). */
const withEvents: Portfolio = {
  ...portfolio,
  mortgages: portfolio.mortgages.map((m): MortgageBlock =>
    m.propertyId === "javorova"
      ? {
          ...m,
          prepayments: [
            {
              date: isoDate("2031-01-17"),
              amount: money("500000"),
              effect: "lowerInstalment",
              fee: money("2000"),
            },
          ],
          recasts: [
            { date: isoDate("2036-01-17"), maturity: isoDate("2042-01-17") },
          ],
        }
      : m,
  ),
};

describe("KPI reference model (engine-free, ADR 0174)", () => {
  it("reads the seed loans the mortgage reference is checked on", () => {
    const { props } = fromEngine(portfolio, assumptions);
    expect(Object.fromEntries(props.map((p) => [p.id, p.loans[0]]))).toEqual(
      SEED_LOANS,
    );
  });

  it("reproduces the parity targets on the seed (independent check)", () => {
    const { props, a } = fromEngine(portfolio, assumptions);
    const ys = referenceProjection(props, a);
    const k = referenceKpis(props, a);
    expect(gap(ys[0]!.balance, PARITY.snapshot.totalDebt)).toBeLessThanOrEqual(
      KC,
    );
    for (const [key, target] of Object.entries(PARITY.kpis)) {
      const v = k[key as keyof typeof k] as Dec | number;
      if (typeof v === "number") expect(v, key).toBe(target);
      else
        expect(gap(v, target), key).toBeLessThanOrEqual(
          RATIO_KEYS.has(key) ? RATIO : KC,
        );
    }
  });

  it("agrees with the engine on the seed, every year and KPI", () => {
    expectEngineMatches(portfolio);
  });

  it("agrees with the engine with a prepayment and a recast", () => {
    const { ys, rk } = expectEngineMatches(withEvents);
    expect(ys.some((y) => y.prepaid.gt(0))).toBe(true);
    // Principal retires the whole opening debt (CLAUDE.md §7).
    expect(gap(rk.totalPrincipalRepaid, ys[0]!.balance)).toBeLessThanOrEqual(
      TIGHT,
    );
  });

  it("finds the IRR only for one sign change", () => {
    const flows = (xs: number[]) => xs.map((x) => new Dec(x));
    expect(() => referenceIrr(flows([-100, 230, -132]))).toThrow(
      /one sign change/,
    );
    expect(Number(referenceIrr(flows([-100, 10, 110])))).toBeCloseTo(0.1, 12);
  });

  const unsupported: [string, Portfolio, Assumptions?][] = [
    [
      "an inactive property",
      {
        ...portfolio,
        properties: portfolio.properties.map((p, i) =>
          i === 0 ? { ...p, active: false } : p,
        ),
      },
    ],
    [
      "a purchase after baseDate",
      {
        ...portfolio,
        properties: portfolio.properties.map((p, i) =>
          i === 0 ? { ...p, purchaseDate: isoDate("2027-01-01") } : p,
        ),
      },
    ],
    [
      "a growth override",
      {
        ...portfolio,
        properties: portfolio.properties.map((p, i) =>
          i === 0 ? { ...p, appreciationOverridePa: rate("0.01") } : p,
        ),
      },
    ],
    [
      "a funding record",
      {
        ...portfolio,
        properties: portfolio.properties.map((p, i) =>
          i === 0 ? { ...p, funding: { ownCash: money("1") } } : p,
        ),
      },
    ],
    [
      "more than one loan per property",
      {
        ...portfolio,
        mortgages: [
          ...portfolio.mortgages,
          {
            ...portfolio.mortgages[0]!,
            id: "x",
            startDate: isoDate("2031-01-17"),
          },
        ],
      },
    ],
    [
      "a development loan or an explicit term",
      {
        ...portfolio,
        mortgages: portfolio.mortgages.map((m, i) =>
          i === 0 ? { ...m, loanTermYears: 25 } : m,
        ),
      },
    ],
    [
      "a loan event on or before baseDate",
      {
        ...portfolio,
        mortgages: portfolio.mortgages.map((m, i) =>
          i === 0
            ? {
                ...m,
                prepayments: [
                  {
                    date: isoDate("2025-01-17"),
                    amount: money("1000"),
                    effect: "shortenTerm",
                  },
                ],
              }
            : m,
        ),
      },
    ],
    [
      "other than one valuation",
      {
        ...portfolio,
        valuations: [
          ...portfolio.valuations,
          {
            ...portfolio.valuations[0]!,
            id: "v2",
            validFrom: isoDate("2028-01-01"),
          },
        ],
      },
    ],
    [
      "a valuation end date",
      {
        ...portfolio,
        valuations: portfolio.valuations.map((v, i) =>
          i === 0 ? { ...v, validTo: isoDate("2030-01-01") } : v,
        ),
      },
    ],
    [
      "overlapping leases",
      {
        ...portfolio,
        leases: [
          ...portfolio.leases,
          {
            ...portfolio.leases[0]!,
            id: "l2",
            startDate: isoDate("2027-01-01"),
          },
        ],
      },
    ],
    [
      "a rate shock",
      portfolio,
      {
        ...assumptions,
        rateShock: { deltaPa: rate("0.01"), durationYears: 2 },
      },
    ],
    [
      "acquisition costs",
      portfolio,
      { ...assumptions, acquisitionCostPct: rate("0.04") },
    ],
  ];
  it.each(unsupported)("throws on %s", (what, p, a = assumptions) => {
    const ref = fromEngine(p, a);
    expect(() => referenceKpis(ref.props, ref.a)).toThrow(what);
  });
});
