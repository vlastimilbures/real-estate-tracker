// The ONE test fixture module (P3, DR-062): the sample portfolio and the parity targets
// from .claude/rules/engine-parity.md. Every engine test imports the seed from here;
// the parity tests are table-driven over PARITY. Dates ISO; money/rates as Decimal.
// Targets change only through an accepted ADR (see the target change log).
import { isoDate } from "../../dates";
import type { Assumptions, Portfolio } from "../../types";
import { rate } from "../../brands";
import { money } from "../../brands";

export const BASE_DATE = isoDate("2026-06-07");

export const assumptions: Assumptions = {
  baseDate: BASE_DATE,
  appreciationPa: rate("0.04"),
  rentIndexationPa: rate("0.03"),
  vacancyAllowance: rate("0.05"),
  postFixationResetRatePa: rate("0.045"),
  horizonYears: 30,
  inflationPa: rate("0.025"),
  defaults: {
    propertyTaxYr: money("2550"),
    insuranceYr: money("2550"),
    mgmtPctRent: rate("0.15"),
    maintPctRent: rate("0.05"),
    svjMonthly: money("1700"),
    otherYr: money("0"),
  },
};

// Per-property holding-cost override: svjMonthly 850 (the rest match defaults).
function holdingFor(propertyId: string) {
  return {
    id: `hc-${propertyId}`,
    propertyId,
    propertyTaxYr: money("2550"),
    insuranceYr: money("2550"),
    mgmtPctRent: rate("0.15"),
    maintPctRent: rate("0.05"),
    svjMonthly: money("850"),
    otherYr: money("0"),
  };
}

export const portfolio: Portfolio = {
  properties: [
    {
      id: "javorova",
      name: "Byt Javorova",
      type: "3 bedroom",
      sizeM2: 71,
      purchaseDate: isoDate("2015-06-01"),
      purchasePrice: money("4080000"),
    },
    {
      id: "lipova",
      name: "Byt Lipova",
      type: "1 bedroom",
      sizeM2: 55,
      purchaseDate: isoDate("2022-01-15"),
      purchasePrice: money("7225000"),
    },
    {
      id: "dubova",
      name: "Byt Dubova",
      type: "1 bedroom",
      sizeM2: 47,
      purchaseDate: isoDate("2023-02-01"),
      purchasePrice: money("6375000"),
    },
  ],
  mortgages: [
    {
      id: "m-javorova",
      propertyId: "javorova",
      startDate: isoDate("2021-01-17"),
      initialPrincipal: money("1912500"),
      fixationYears: 10,
      interestRatePa: rate("0.0169"),
      monthlyInstalment: money("6721.8"),
    },
    {
      id: "m-lipova",
      propertyId: "lipova",
      startDate: isoDate("2022-01-15"),
      initialPrincipal: money("5610000"),
      fixationYears: 7,
      interestRatePa: rate("0.0359"),
      monthlyInstalment: money("25567.15"),
    },
    {
      id: "m-dubova",
      propertyId: "dubova",
      startDate: isoDate("2024-03-12"),
      initialPrincipal: money("3034500"),
      fixationYears: 7,
      interestRatePa: rate("0.0449"),
      monthlyInstalment: money("21576.4"),
    },
  ],
  valuations: [
    {
      id: "v-javorova",
      propertyId: "javorova",
      validFrom: isoDate("2026-06-01"),
      marketValue: money("10200000"),
    },
    {
      id: "v-lipova",
      propertyId: "lipova",
      validFrom: isoDate("2026-06-01"),
      marketValue: money("8925000"),
    },
    {
      id: "v-dubova",
      propertyId: "dubova",
      validFrom: isoDate("2026-06-01"),
      marketValue: money("9605000"),
    },
  ],
  leases: [
    {
      id: "l-javorova",
      propertyId: "javorova",
      startDate: isoDate("2025-09-01"),
      monthlyRent: money("27200"),
    },
    {
      id: "l-dubova",
      propertyId: "dubova",
      startDate: isoDate("2025-07-01"),
      monthlyRent: money("21675"),
    },
    {
      // Lease ending 2026-08-30 — in force at baseDate (the effective-dating test).
      id: "l-lipova-1",
      propertyId: "lipova",
      startDate: isoDate("2025-09-01"),
      endDate: isoDate("2026-08-30"),
      monthlyRent: money("21675"),
    },
    {
      id: "l-lipova-2",
      propertyId: "lipova",
      startDate: isoDate("2026-09-01"),
      monthlyRent: money("23205"),
    },
  ],
  holdingCosts: [
    holdingFor("javorova"),
    holdingFor("lipova"),
    holdingFor("dubova"),
  ],
};

/** The seed with one property's id changed everywhere it is referenced: for example to `""`,
 *  the id a name without Latin letters got before ADR 0127. */
export function withPropertyId(from: string, to: string): Portfolio {
  const moved = <T extends { propertyId: string }>(rows: T[]): T[] =>
    rows.map((r) => (r.propertyId === from ? { ...r, propertyId: to } : r));
  return {
    properties: portfolio.properties.map((p) =>
      p.id === from ? { ...p, id: to } : p,
    ),
    mortgages: moved(portfolio.mortgages),
    valuations: moved(portfolio.valuations),
    leases: moved(portfolio.leases),
    holdingCosts: moved(portfolio.holdingCosts),
  };
}

// ---------------------------------------------------------------------------
// Parity targets (.claude/rules/engine-parity.md). Money ±1 Kč, ratios ±0.0001.
// ---------------------------------------------------------------------------

export type PropertyId = "javorova" | "lipova" | "dubova";

export const PARITY = {
  snapshot: {
    totalValue: 28_730_000,
    totalDebt: 9_515_405.13,
    totalEquity: 19_214_594.87,
    ltv: 0.3312,
    grossAnnualRent: 846_600,
    effectiveGrossIncome: 804_270,
    holdingCosts: 215_220,
    noi: 589_050,
    annualDebtService: 646_384.2,
    netCashFlow: -57_334.2,
    grossYield: 0.02947,
    netYield: 0.0205,
    dscr: 0.9113,
    weightedAvgRate: 0.035226,
  },
  perProperty: {
    javorova: {
      value: 10_200_000,
      debt: 1_642_907.31,
      noi: 229_500,
      annualDebtService: 80_661.6,
      netCashFlow: 148_838.4,
      dscr: 2.84522,
    },
    lipova: {
      value: 8_925_000,
      debt: 5_116_588.94,
      noi: 179_775,
      annualDebtService: 306_805.8,
      netCashFlow: -127_030.8,
      dscr: 0.585957,
    },
    dubova: {
      value: 9_605_000,
      debt: 2_755_908.88,
      noi: 179_775,
      annualDebtService: 258_916.8,
      netCashFlow: -79_141.8,
      dscr: 0.694335,
    },
  },
  /** Byt Javorova schedule rows (1-based month from baseDate). */
  amortization: {
    1: { interest: 2313.8, principal: 4408, endBalance: 1_638_499.3 },
    55: { interest: 1965.7, principal: 4756.1, endBalance: 1_391_012.7 },
    // D-21: month 56 is the payment due on the fixation end (fixed rate); reset from 57.
    56: { interest: 1959, principal: 4762.8, endBalance: 1_386_249.9 },
    57: { interest: 5198.4, principal: 3483, endBalance: 1_382_766.9 },
    300: { interest: 32.4, principal: 8649, endBalance: 0 },
  },
  kpis: {
    netWorthNominal: 93_182_810.46,
    netWorthReal: 44_424_223.27,
    netWorthMultiple: 4.8496,
    cagrNominal: 0.054,
    cagrReal: 0.0283,
    cumulativeNetCashFlow: 14_705_700.29,
    firstCashFlowPositiveYear: 2031,
    debtFreeYear: 2052,
    leveredIrrNominal: 0.061795,
    leveredIrrReal: 0.035898,
    totalPrincipalRepaid: 9_515_405,
  },
} as const;

/** Snapshot keys that are ratios (±0.0001); every other numeric key is money (±1 Kč). */
export const RATIO_KEYS: ReadonlySet<string> = new Set([
  "ltv",
  "grossYield",
  "netYield",
  "dscr",
  "weightedAvgRate",
  "netWorthMultiple",
  "cagrNominal",
  "cagrReal",
  "leveredIrrNominal",
  "leveredIrrReal",
]);
