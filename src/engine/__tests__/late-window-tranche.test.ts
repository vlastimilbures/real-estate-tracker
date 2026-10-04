// ADR 0129 §1 (#135 R1-03): a prepayment or recast dated after the last payment due by
// baseDate (and on/before baseDate) settles right after that payment, but it sees the
// late tranches dated on or before it. The tranche itself still joins grid month 1
// (D-41) and is counted once. Development loan paying on the 15th; tranche 1,000,000 on
// 04-20, events on 04-25.
import { describe, it, expect } from "vitest";
import { isoDate } from "../dates";
import { openingBalance, propertySchedule } from "../schedule";
import type { RefLoan } from "./reference/mortgageReference";
import { both, maxDev, TIGHT, toBlock } from "./reference/eventHarness";
import { assumptions } from "./support/seed";

const loan: RefLoan = {
  start: "2026-01-15",
  principal: 100000,
  ratePa: 0.05,
  instalment: 600,
  fixationMonths: 60,
  termMonths: 300,
  draws: [{ date: "2026-04-20", amount: 1000000 }],
};
const at = (base: string) => ({ ...assumptions, baseDate: isoDate(base) });
const outcomes = (l: RefLoan, base: string) =>
  propertySchedule([toBlock(l)], at(base)).eventOutcomes;

// 04-22: the events wait for grid month 1 (after the tranche). 04-28 and 05-14: the
// late window (payment 3 on 04-15 is the last due). 05-20: payment 4 on 05-15 is due.
const BASES = ["2026-04-22", "2026-04-28", "2026-05-14", "2026-05-20"];

describe("ADR 0129 §1: a late-window prepayment sees the late tranche", () => {
  const prepaid: RefLoan = {
    ...loan,
    prepayments: [
      { date: "2026-04-25", amount: 300000, effect: "lowerInstalment" },
    ],
  };

  it.each(BASES)("applies the full 300,000 with baseDate %s", (base) => {
    const [o] = outcomes(prepaid, base);
    expect(o?.applied.toFixed(2)).toBe("300000.00");
    expect(o?.issue).toBeNull();
  });

  it.each(["2026-04-28", "2026-05-14"])(
    "takes 300,000 off the baseDate debt and counts the tranche once (%s)",
    (base) => {
      const without = openingBalance(toBlock(loan), at(base));
      const withPrepayment = openingBalance(toBlock(prepaid), at(base));
      expect(without.minus(withPrepayment).toFixed(4)).toBe("300000.0000");
      expect(without.greaterThan(1000000)).toBe(true);
    },
  );

  it.each(BASES)("matches the reference model with baseDate %s", (base) => {
    const { e, r } = both(prepaid, base);
    expect(maxDev(e, r)).toBeLessThan(TIGHT);
  });
});

describe("ADR 0129 §1: the bank's answer and a recast see it too", () => {
  it("shortens the term on the balance with the tranche", () => {
    // 60,000 off ≈ 99,494 leaves ≈ 39,494 before the 50,000 tranche: the bank's NPER
    // at the ≈ 585 Kč instalment is ≈ 80 payments on that, ≈ 220 with the tranche.
    const l: RefLoan = {
      ...loan,
      draws: [{ date: "2026-04-20", amount: 50000 }],
      prepayments: [
        { date: "2026-04-25", amount: 60000, effect: "shortenTerm" },
      ],
    };
    const { e, r } = both(l, "2026-04-28");
    expect(maxDev(e, r)).toBeLessThan(TIGHT);
    const paying = e.filter((row) => row.principal.greaterThan(0)).length;
    expect(paying).toBeGreaterThan(150);
    expect(paying).toBeLessThan(297);
  });

  it("an instalment recast's NPER runs on the balance with the tranche", () => {
    const l: RefLoan = {
      ...loan,
      recasts: [{ date: "2026-04-25", instalment: 7000 }],
    };
    const [o] = outcomes(l, "2026-04-28");
    expect(o?.issue).toBeNull();
    const { e, r } = both(l, "2026-04-28");
    expect(maxDev(e, r)).toBeLessThan(TIGHT);
    // The recast already counted the tranche, so grid month 1's tranche does not defer
    // the agreed instalment (ADR 0120): 7,000 holds, as with baseDate 05-20.
    for (const base of ["2026-04-28", "2026-05-20"]) {
      const rows = both(l, base).e;
      expect(rows.slice(0, 3).map((x) => x.instalment.toFixed(2))).toEqual([
        "7000.00",
        "7000.00",
        "7000.00",
      ]);
    }
  });

  it("a one-payment shortenTerm answer is not undone by the tranche", () => {
    // 149,000 off ≈ 149,494 (balance + tranche) leaves ≈ 494: the bank ends the loan at
    // the next payment. Grid month 1's tranche must not restore the contract term
    // (ADR 0116 §2): the loan is repaid in month 1, as with baseDate 05-20.
    const l: RefLoan = {
      ...loan,
      draws: [{ date: "2026-04-20", amount: 50000 }],
      prepayments: [
        { date: "2026-04-25", amount: 149000, effect: "shortenTerm" },
      ],
    };
    for (const base of ["2026-04-28", "2026-05-20"]) {
      const { e, r } = both(l, base);
      expect(maxDev(e, r)).toBeLessThan(TIGHT);
      const paying = e.filter((row) => row.principal.greaterThan(0));
      expect(paying).toHaveLength(1);
      expect(paying[0]?.endBalance.toFixed(2)).toBe("0.00");
    }
  });

  it("a recast to an instalment below the interest with the tranche is ignored", () => {
    // 3,000 covers the interest on 99,494 but not on 1,099,494 (≈ 4,581).
    const l: RefLoan = {
      ...loan,
      recasts: [{ date: "2026-04-25", instalment: 3000 }],
    };
    expect(outcomes(l, "2026-04-28")[0]?.issue).toBe(
      "RECAST_INSTALMENT_BELOW_INTEREST",
    );
  });

  it("an event dated before the tranche does not see it", () => {
    const l: RefLoan = {
      ...loan,
      draws: [{ date: "2026-04-26", amount: 1000000 }],
      prepayments: [
        { date: "2026-04-25", amount: 300000, effect: "lowerInstalment" },
      ],
    };
    const [o] = outcomes(l, "2026-04-28");
    expect(o?.issue).toBe("PREPAYMENT_EXCEEDS_BALANCE");
    expect(o?.applied.lessThan(100000)).toBe(true);
    const { e, r } = both(l, "2026-04-28");
    expect(maxDev(e, r)).toBeLessThan(TIGHT);
  });
});
