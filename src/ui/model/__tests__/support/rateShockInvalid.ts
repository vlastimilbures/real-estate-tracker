// Stored data the engine refuses, under a rate-shock scenario (ADR 0247, #543): the reach
// note must not walk its payment grid. Shared by rateShockNote-invalid.test.ts and the
// child process it runs each case in first, so a case that never returns cannot hang
// the suite.
import { isoDate, rate } from "../../../../engine";
import type {
  Assumptions,
  MortgageBlock,
  MortgageBlockFields,
  Portfolio,
} from "../../../../engine";
import {
  assumptions,
  portfolio,
} from "../../../../engine/__tests__/support/seed";
import { en } from "../../../../i18n/en";
import { rateShockNote } from "../../rateShockReach";

/** An Invalid Date, as a restore can hand the engine one. */
const BAD = isoDate("invalid");

const [first, ...rest] = portfolio.mortgages;
if (!first) throw new Error("the seed has loans");

/** The seed portfolio with its first loan changed. */
const withFirst = (change: Partial<MortgageBlockFields>): Portfolio => ({
  ...portfolio,
  mortgages: [{ ...first, ...change } as MortgageBlock, ...rest],
});

const CASES = {
  // A valid start and a recast to an Invalid Date maturity: hung on main @ 80f10405.
  recastInvalidMaturity: [
    withFirst({ recasts: [{ date: isoDate("2030-02-01"), maturity: BAD }] }),
    assumptions,
  ],
  invalidStart: [
    withFirst({
      startDate: BAD,
      recasts: [
        { date: isoDate("2030-02-01"), maturity: isoDate("2045-01-17") },
      ],
    }),
    assumptions,
  ],
  invalidBaseDate: [portfolio, { ...assumptions, baseDate: BAD }],
} satisfies Record<string, [Portfolio, Assumptions]>;

export type RateShockInvalidCase = keyof typeof CASES;

/** The reach note of a two-year rate shock on one case's data. */
export function invalidNote(name: RateShockInvalidCase): string | undefined {
  const [p, a] = CASES[name];
  return rateShockNote(
    {
      id: "s",
      name: "s",
      overrides: {
        rateShock: { deltaPa: rate("0.02"), durationYears: 2 },
      },
    },
    p,
    a,
    en,
  );
}
