// Schedules whose recasts let the build run past the contract term (ADR 0116). The grid
// stops at the loan's last payment (or the horizon) instead of building to the 50-year
// cap and trimming. Each case runs through the engine and the independent reference
// model (#130 R1-15): every row agrees, the last row is the last payment, principal is
// conserved, and the event outcomes are spelled out, so a fix shows which number moved.
import { describe, it, expect } from "vitest";
import { D } from "../../lib/money";
import { openingBalance } from "../schedule";
import type { RefLoan, RefRecast } from "./reference/mortgageReference";
import { SEED_LOANS } from "./reference/seedLoans";
import {
  TIGHT,
  chainBoth,
  maxDev,
  sum,
  toBlock,
} from "./reference/eventHarness";
import { devBlock } from "./support/mixed";
import { assumptions } from "./support/seed";

const J = SEED_LOANS.javorova;
/** `devBlock` (support/mixed.ts) as a reference loan. */
const dev: RefLoan = {
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
const refi: RefLoan = {
  start: "2036-01-17",
  principal: "900000",
  ratePa: "0.039",
  instalment: "9800",
  fixationMonths: 60,
};
const toInstalment = (date: string, instalment: number): RefRecast => ({
  date,
  instalment,
});
const toMaturity = (date: string, maturity: string): RefRecast => ({
  date,
  maturity,
});

/** An event outcome: block, kind, date, grid month, issue. */
type Outcome = [string, string, string, number | null, string | null];
const recastAt56 = (issue: string | null): Outcome => [
  "b0",
  "recast",
  "2031-01-17",
  56,
  issue,
];

const iso = (d: Date) => d.toISOString().slice(0, 10);

function expectMatchesReference(loans: RefLoan[], outcomes: Outcome[]) {
  const { e, r } = chainBoth(loans);
  // Every column agrees, and every reference row past the engine's last is idle.
  expect(maxDev(e.rows, r.rows, r.handovers)).toBeLessThanOrEqual(TIGHT);
  // maxDev reads the instalment only where the reference pays; elsewhere it is 0.
  const idle = e.rows.filter((_, i) => !r.rows[i].payment.greaterThan(0));
  expect(idle.every((x) => x.instalment.isZero())).toBe(true);
  expect(e.rows.map((x) => [x.month, iso(x.date)])).toEqual(
    r.rows.slice(0, e.rows.length).map((x) => [x.month, x.date]),
  );
  // The grid ends at the last payment, or at the horizon when that comes later.
  const lastPaid = r.rows.reduce(
    (m, x) => (x.payment.plus(x.prepaid).greaterThan(0) ? x.month : m),
    0,
  );
  expect(e.rows).toHaveLength(
    Math.max(lastPaid, assumptions.horizonYears * 12),
  );
  // Σ principal + Σ prepaid = opening debt + new debt (drawn and the refinance
  // differences, ADR 0130), and the loan ends repaid.
  const last = e.rows.at(-1)?.endBalance ?? D(0);
  expect(last.toNumber()).toBe(0);
  const opening = openingBalance(toBlock(loans[0]), assumptions);
  const repaid = sum(e.rows, (x) => x.principal.plus(x.prepaid));
  const drawn = sum(e.rows, (x) => x.drawn.plus(x.refinanced));
  expect(
    repaid.minus(opening).minus(drawn).abs().toNumber(),
  ).toBeLessThanOrEqual(TIGHT);
  expect(
    e.refinances.map((x) => [
      x.month,
      x.paidOff.toNumber(),
      x.drawn.toNumber(),
    ]),
  ).toEqual(
    r.handovers.map((h) => [h.month, h.paidOff.toNumber(), h.drawn.toNumber()]),
  );
  expect(
    e.eventOutcomes.map((o) => [
      o.blockId,
      o.kind,
      iso(o.date),
      o.month,
      o.issue,
    ]),
  ).toEqual(outcomes);
  // A prepayment repays what the reference prepays in its row, at its fee; a recast
  // repays nothing and costs nothing.
  for (const o of e.eventOutcomes) {
    const row =
      o.kind === "prepayment" ? r.rows[(o.month ?? 0) - 1] : undefined;
    const [applied, fee] = row ? [row.prepaid, row.fee] : [0, 0];
    expect(
      o.applied.minus(applied.toString()).abs().toNumber(),
    ).toBeLessThanOrEqual(TIGHT);
    expect(o.fee.minus(fee.toString()).abs().toNumber()).toBe(0);
  }
}

it("the dev loan is devBlock", () => {
  expect(toBlock(dev, "m-dev", "dev")).toEqual(devBlock);
});

describe("ADR 0116: schedules a recast extends (#130 R1-15)", () => {
  it.each<[string, RefLoan[], Outcome[]]>([
    [
      "lower instalment",
      [{ ...J, recasts: [toInstalment("2031-01-17", 7000)] }],
      [recastAt56(null)],
    ],
    [
      "higher instalment",
      [{ ...J, recasts: [toInstalment("2031-01-17", 15000)] }],
      [recastAt56(null)],
    ],
    [
      "capped at 50 years",
      [{ ...J, recasts: [toInstalment("2031-01-17", 5300)] }],
      [recastAt56("RECAST_TERM_CAPPED")],
    ],
    [
      "below the interest",
      [{ ...J, recasts: [toInstalment("2031-01-17", 100)] }],
      [recastAt56("RECAST_INSTALMENT_BELOW_INTEREST")],
    ],
    [
      "later maturity",
      [{ ...J, recasts: [toMaturity("2031-01-17", "2065-01-17")] }],
      [recastAt56(null)],
    ],
    [
      "recast, then paid off",
      [
        {
          ...J,
          recasts: [toInstalment("2031-01-17", 6000)],
          prepayments: [
            { date: "2040-02-01", amount: 5000000, effect: "lowerInstalment" },
          ],
        },
      ],
      [
        recastAt56("RECAST_TERM_CAPPED"),
        ["b0", "prepayment", "2040-02-01", 165, "PREPAYMENT_EXCEEDS_BALANCE"],
      ],
    ],
    [
      "dev loan after completion",
      [{ ...dev, recasts: [toInstalment("2028-01-10", 22000)] }],
      [["b0", "recast", "2028-01-10", 20, null]],
    ],
    [
      "refinanced",
      [{ ...J, recasts: [toInstalment("2031-01-17", 6000)] }, refi],
      [recastAt56("RECAST_TERM_CAPPED")],
    ],
  ])("%s: engine = reference", (_, loans, outcomes) => {
    expectMatchesReference(loans, outcomes);
  });
});
