// ADR 0109: prepayments and recasts run through BOTH the engine and the independent
// reference model, on the engine's calendar (J-03 a′, D-21). Every column, including
// the prepaid principal, agrees to 1e-6 Kč, and principal is conserved.
import { describe, it, expect } from "vitest";
import { openingBalance } from "../../schedule";
import { isoDate } from "../../dates";
import { D } from "../../../lib/money";
import { rate } from "../../brands";
import type { Assumptions } from "../../types";
import { assumptions as A0 } from "../support/seed";
import { type RefLoan, type RefOptions } from "./mortgageReference";
import { SEED_LOANS } from "./seedLoans";
import { TIGHT, both, chainBoth, maxDev, sum, toBlock } from "./eventHarness";

const J = SEED_LOANS.javorova;
const lower = (date: string, amount: number | string, fee?: number) => ({
  date,
  amount,
  effect: "lowerInstalment" as const,
  ...(fee != null ? { fee } : {}),
});
const shorten = (date: string, amount: number | string) => ({
  date,
  amount,
  effect: "shortenTerm" as const,
});

const devIo: RefLoan = {
  start: "2026-03-01",
  principal: "2000000",
  ratePa: "0.049",
  instalment: "11000",
  fixationMonths: 60,
  termMonths: 360,
  draws: [
    { date: "2026-11-15", amount: "1500000" },
    { date: "2027-08-20", amount: "1000000" },
  ],
  completion: "2027-08-20",
};
const devDrawsOnly: RefLoan = {
  start: "2026-03-01",
  principal: "2000000",
  ratePa: "0.049",
  instalment: "11000",
  fixationMonths: 60,
  termMonths: 360,
  draws: [{ date: "2028-03-10", amount: "500000" }],
};
/** #109: the recast's payment q (2027-02-01) takes the tranche dated 2027-01-15. */
const onRecastPayment: RefLoan = {
  ...devDrawsOnly,
  draws: [{ date: "2027-01-15", amount: "1000000" }],
  recasts: [{ date: "2027-01-01", instalment: 15000 }],
};
/** A plain loan on the same dates, 30-year fixation: events without any tranche. */
const plainForRecast: RefLoan = {
  start: "2026-03-01",
  principal: "2000000",
  ratePa: "0.049",
  instalment: "10614.53",
  fixationMonths: 360,
  termMonths: 360,
};
const future: RefLoan = {
  start: "2027-01-15",
  principal: "1500000",
  ratePa: "0.04",
  instalment: "8000",
  fixationMonths: 60,
};

type Case = [
  string,
  RefLoan,
  string?,
  Partial<RefOptions>?,
  Partial<Assumptions>?,
];

const CASES: Case[] = [
  [
    "a: lower at the fixation end",
    { ...J, prepayments: [lower("2031-01-17", 500000)] },
  ],
  [
    "b: shorten at the fixation end",
    { ...J, prepayments: [shorten("2031-01-17", 500000)] },
  ],
  [
    "off-cycle date, lower",
    { ...J, prepayments: [lower("2031-01-20", 500000)] },
  ],
  [
    "off-cycle date, shorten",
    { ...J, prepayments: [shorten("2031-01-20", 500000)] },
  ],
  [
    "due date mid-fixation, lower",
    { ...J, prepayments: [lower("2027-03-17", 300000)] },
  ],
  [
    "due date mid-fixation, shorten",
    { ...J, prepayments: [shorten("2027-03-17", 300000)] },
  ],
  [
    "mid-period, shorten",
    { ...J, prepayments: [shorten("2027-03-20", 300000)] },
  ],
  [
    "above the balance: clamped",
    { ...J, prepayments: [lower("2031-01-17", 5000000)] },
  ],
  [
    "two in one period, mixed effects (the last one's applies)",
    {
      ...J,
      prepayments: [shorten("2031-01-10", 100000), lower("2031-01-17", 200000)],
    },
  ],
  [
    "two in one year",
    {
      ...J,
      prepayments: [lower("2028-02-17", 100000), shorten("2028-09-17", 100000)],
    },
  ],
  [
    "after payoff: nothing applied",
    {
      ...J,
      prepayments: [lower("2030-01-17", 5000000), lower("2031-01-17", 1000)],
    },
  ],
  ["with a fee", { ...J, prepayments: [lower("2031-01-17", 500000, 2500)] }],
  [
    "replayed before baseDate, lower",
    { ...J, prepayments: [lower("2024-01-17", 200000)] },
  ],
  [
    "replayed before baseDate, shorten",
    { ...J, prepayments: [shorten("2024-01-17", 200000)] },
  ],
  [
    "after the last payment due and on/before baseDate",
    { ...J, prepayments: [shorten("2026-05-20", 200000)] },
  ],
  [
    "the same off-cycle date replayed (baseDate moved past it)",
    { ...J, prepayments: [shorten("2031-01-20", 500000)] },
    "2031-06-07",
  ],
  [
    "rate shock with a shortened term",
    { ...J, prepayments: [shorten("2031-01-17", 500000)] },
    "2026-06-07",
    { rateShock: { deltaPa: "0.03", months: 24, anchor: "fixationEnd" } },
    { rateShock: { deltaPa: rate("0.03"), durationYears: 2 } },
  ],
  [
    "recast to a later maturity",
    { ...J, recasts: [{ date: "2031-01-17", maturity: "2055-01-17" }] },
  ],
  [
    "recast to an earlier maturity",
    { ...J, recasts: [{ date: "2031-01-17", maturity: "2045-01-17" }] },
  ],
  [
    "recast mid-fixation",
    { ...J, recasts: [{ date: "2028-06-17", maturity: "2040-06-17" }] },
  ],
  [
    "recast to an instalment after a prepayment",
    {
      ...J,
      prepayments: [lower("2031-01-17", 500000)],
      recasts: [{ date: "2031-01-17", instalment: 6000 }],
    },
  ],
  [
    "recast to an instalment mid-fixation",
    { ...J, recasts: [{ date: "2028-01-17", instalment: 9000 }] },
  ],
  [
    "recast to an instalment past the cap",
    { ...J, recasts: [{ date: "2031-01-17", instalment: 6000 }] },
  ],
  [
    "recast to an instalment below the interest: ignored",
    { ...J, recasts: [{ date: "2031-01-17", instalment: 5000 }] },
  ],
  [
    "shorten, then recast back to the original maturity",
    {
      ...J,
      prepayments: [shorten("2031-01-17", 500000)],
      recasts: [{ date: "2033-01-17", maturity: "2051-05-17" }],
    },
  ],
  [
    "shorten and an instalment recast in the refix period",
    {
      ...J,
      prepayments: [shorten("2031-01-17", 500000)],
      recasts: [{ date: "2031-01-17", instalment: 7000 }],
    },
  ],
  [
    "recast replayed before baseDate",
    { ...J, recasts: [{ date: "2025-01-17", maturity: "2045-01-17" }] },
  ],
  [
    "future loan: after its first payment",
    { ...future, prepayments: [lower("2027-01-20", 100000)] },
  ],
  [
    "dev loan, interest-only, lower",
    { ...devIo, prepayments: [lower("2027-01-10", 200000)] },
  ],
  [
    "dev loan, interest-only, shorten",
    { ...devIo, prepayments: [shorten("2027-01-10", 200000)] },
  ],
  [
    "dev loan, maturity recast during interest-only",
    { ...devIo, recasts: [{ date: "2027-01-10", maturity: "2050-03-01" }] },
  ],
  [
    "dev loan, tranche on the maturity payment (ADR 0116)",
    {
      ...devDrawsOnly,
      draws: [
        { date: "2026-11-15", amount: "1500000" },
        { date: "2027-07-20", amount: "1000000" },
      ],
      recasts: [{ date: "2027-01-10", maturity: "2027-08-01" }],
    },
  ],
  [
    "dev loan, instalment recast after completion",
    { ...devIo, recasts: [{ date: "2028-01-10", instalment: 25000 }] },
  ],
  [
    "dev loan, tranche on an instalment recast's payment (ADR 0120)",
    { ...onRecastPayment, fixationMonths: 360 },
  ],
  [
    "dev loan, tranche on an instalment recast's payment, then a reset (ADR 0120)",
    onRecastPayment,
  ],
  [
    "dev loan, tranche on an instalment recast's payment, replayed (ADR 0120)",
    onRecastPayment,
    "2027-02-07",
  ],
  [
    "dev loan, tranche the payment after an instalment recast's (ADR 0120)",
    {
      ...onRecastPayment,
      draws: [{ date: "2027-02-15", amount: "1000000" }],
    },
  ],
  [
    "dev loan, a rate reset and a tranche both on the recast's payment (ADR 0120)",
    {
      ...onRecastPayment,
      draws: [{ date: "2031-03-15", amount: "1000000" }],
      recasts: [{ date: "2031-03-01", instalment: 25000 }],
    },
  ],
  [
    "dev loan, tranche on the recast's payment, then an instalment recast (ADR 0120)",
    {
      ...onRecastPayment,
      recasts: [
        { date: "2027-01-01", instalment: 15000 },
        { date: "2027-02-01", instalment: 20000 },
      ],
    },
  ],
  [
    "dev loan, tranche on the recast's payment, then a maturity recast (ADR 0120)",
    {
      ...onRecastPayment,
      recasts: [
        { date: "2027-01-01", instalment: 15000 },
        { date: "2027-02-01", maturity: "2050-03-01" },
      ],
    },
  ],
  [
    "dev loan, tranche on the recast's payment, then shorten (ADR 0120)",
    { ...onRecastPayment, prepayments: [shorten("2027-02-01", 300000)] },
  ],
  [
    "dev loan, recast and tranche between the last payment and baseDate (ADR 0120, D-41)",
    {
      ...onRecastPayment,
      recasts: [{ date: "2027-01-10", instalment: 15000 }],
    },
    "2027-01-20",
  ],
  [
    "dev loan, tranche on a recast's payment that is its maturity (ADR 0116, 0120)",
    {
      ...onRecastPayment,
      recasts: [{ date: "2027-01-01", instalment: 2100000 }],
    },
  ],
  [
    "plain loan, lower between an instalment recast and baseDate: no tranche, no re-amortization",
    {
      ...plainForRecast,
      recasts: [{ date: "2027-01-01", instalment: 15000 }],
      prepayments: [lower("2027-01-10", 200000)],
    },
    "2027-01-20",
  ],
  [
    "dev loan, lower between an instalment recast and baseDate: no tranche, no re-amortization",
    {
      ...devDrawsOnly,
      recasts: [{ date: "2027-01-01", instalment: 15000 }],
      prepayments: [lower("2027-01-10", 200000)],
    },
    "2027-01-20",
  ],
  [
    "dev loan replayed before baseDate",
    { ...devIo, prepayments: [lower("2026-04-15", 100000, 1000)] },
  ],
  [
    "dev loan between tranches, lower",
    { ...devDrawsOnly, prepayments: [lower("2027-01-10", 300000)] },
  ],
  [
    "dev loan between tranches, shorten",
    { ...devDrawsOnly, prepayments: [shorten("2027-01-10", 300000)] },
  ],
  [
    "dev loan, tranche after a shortened term",
    { ...devDrawsOnly, prepayments: [shorten("2026-09-10", 1950000)] },
  ],
];

describe("ADR 0109: engine = reference with prepayments and recasts", () => {
  it.each(CASES)("%s", (_, loan, base, opts, extra) => {
    const { e, r } = both(loan, base, opts, extra);
    expect(maxDev(e, r)).toBeLessThanOrEqual(TIGHT);
  });

  it.each(CASES)(
    "%s: every row's balance identity holds",
    (_, loan, base, opts, extra) => {
      const { e } = both(loan, base, opts, extra);
      // From the engine's own opening, not from row 1, so row 1 is checked too.
      let prev = openingBalance(toBlock(loan), {
        ...A0,
        baseDate: isoDate(base ?? "2026-06-07"),
        ...extra,
      });
      for (const row of e) {
        const expected = prev
          .minus(row.principal)
          .minus(row.prepaid)
          .plus(row.drawn);
        expect(
          row.endBalance.minus(expected).abs().toNumber(),
        ).toBeLessThanOrEqual(TIGHT);
        expect(row.endBalance.isNegative()).toBe(false);
        prev = row.endBalance;
      }
    },
  );
});

describe("ADR 0109: refinance handovers with prepayments", () => {
  const refi = (start: string): RefLoan => ({
    start,
    principal: "1633000",
    ratePa: "0.039",
    instalment: "9800",
    fixationMonths: 60,
  });
  const cases: [string, RefLoan[]][] = [
    [
      "prepaid on the refix date (payment kept)",
      [
        { ...J, prepayments: [lower("2031-01-17", 500000)] },
        refi("2031-01-17"),
      ],
    ],
    [
      "prepaid before a refinance that drops the payment",
      [
        { ...J, prepayments: [lower("2031-01-05", 500000, 3000)] },
        refi("2031-01-10"),
      ],
    ],
    [
      "two same-day, same-amount prepayments with different fees (ADR 0116)",
      [
        {
          ...J,
          prepayments: [
            lower("2031-01-05", 100000, 1000),
            lower("2031-01-05", 100000, 3000),
          ],
        },
        refi("2031-01-10"),
      ],
    ],
    [
      "prepayment due after the successor's start but dated before it",
      [
        { ...J, prepayments: [shorten("2031-01-09", 200000)] },
        refi("2031-01-10"),
      ],
    ],
    [
      "prepayment after the successor's start: dropped",
      [
        { ...J, prepayments: [lower("2031-03-01", 500000)] },
        refi("2031-01-17"),
      ],
    ],
  ];

  it.each(cases)("%s: engine = reference", (_, loans) => {
    const { e, r } = chainBoth(loans);
    expect(maxDev(e.rows, r.rows, r.handovers)).toBeLessThanOrEqual(TIGHT);
    expect(e.refinances).toHaveLength(r.handovers.length);
    e.refinances.forEach((x, i) => {
      const h = r.handovers[i];
      expect(x.month).toBe(h.month);
      expect(
        x.paidOff.minus(h.paidOff.toString()).abs().toNumber(),
      ).toBeLessThanOrEqual(TIGHT);
      expect(
        x.drawn.minus(h.drawn.toString()).abs().toNumber(),
      ).toBeLessThanOrEqual(TIGHT);
    });
  });

  it.each(cases)(
    "%s: Σ principal + Σ prepaid = debt + Σ(drawn − paid off)",
    (_, loans) => {
      const { e } = chainBoth(loans);
      const first = e.rows[0];
      const opening = first.endBalance
        .plus(first.principal)
        .plus(first.prepaid);
      const expected = e.refinances.reduce(
        (s, x) => s.plus(x.drawn).minus(x.paidOff),
        opening,
      );
      const repaid = sum(e.rows, (x) => x.principal.plus(x.prepaid));
      const last = e.rows.at(-1)?.endBalance ?? D(0);
      expect(
        repaid.plus(last).minus(expected).abs().toNumber(),
      ).toBeLessThanOrEqual(TIGHT);
    },
  );
});
