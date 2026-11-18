// ADR 0235 §5, case A: an explicit-term plain loan whose instalment is at or below the
// month's interest. The reference model refuses that loan as a plain loan
// (`validate`, mortgageReference.ts:246-253: it never amortizes); the guard is not
// lifted here. The same loan with 1 Kč of its principal entered as a tranche on its
// start date is a development loan to the reference: the tranche joins the opening
// principal with no re-amortization, there is no interest-only phase and the entered
// instalment is kept, so it runs the reference's plain step rule (`:406-410`: principal
// floored at 0, the payment at maturity clears the balance) without the plain-loan
// guard. The engine's replayed opening of the plain loan matches it.
import { describe, it, expect } from "vitest";
import { D } from "../../../lib/money";
import { isoDate } from "../../dates";
import { rate } from "../../brands";
import { openingBalance } from "../../schedule";
import { assumptions as A0 } from "../support/seed";
import { TIGHT, toBlock } from "./eventHarness";
import { referenceBalanceAt, type RefLoan } from "./mortgageReference";

/** Case A loans: 2,000,000 Kč at 5 % (interest 8,333.33… Kč a month) or 10,811,000 Kč
 *  at 8.11 % (73,064.… Kč), each over an explicit term. */
const CASES: Record<string, { loan: RefLoan; bases: string[] }> = {
  "2 M at 5 %, 8,000 Kč, 20 years": {
    loan: {
      start: "2021-01-17",
      principal: "2000000",
      ratePa: "0.05",
      instalment: "8000",
      fixationMonths: 120,
      termMonths: 240,
    },
    // Before, on and after maturity (2041-01-17).
    bases: [
      "2021-01-17",
      "2026-06-07",
      "2041-01-16",
      "2041-01-17",
      "2050-06-07",
    ],
  },
  "2 M at 5 %, the exact interest, 20 years": {
    loan: {
      start: "2021-01-31",
      principal: "2000000",
      ratePa: "0.05",
      instalment: D("2000000").times(D("0.05").div(12)).toString(),
      fixationMonths: 60,
      termMonths: 240,
    },
    bases: ["2026-06-07", "2040-12-31", "2041-01-31", "2049-02-28"],
  },
  "10.8 M at 8.11 %, 61,672.94 Kč, 24 years": {
    loan: {
      start: "2010-02-28",
      principal: "10811000",
      ratePa: "0.0811",
      instalment: "61672.94",
      fixationMonths: 36,
      termMonths: 288,
    },
    bases: [
      "2017-02-28",
      "2026-06-07",
      "2034-02-27",
      "2034-02-28",
      "2040-01-01",
    ],
  },
};

/** The same loan with 1 Kč of its principal as a tranche on its start date. */
const asTranche = (l: RefLoan): RefLoan => ({
  ...l,
  principal: D(String(l.principal)).minus(1).toString(),
  draws: [{ date: l.start, amount: "1" }],
});

/** Every payment at the loan's own rate: the reset rate is set to it. */
const engine = (l: RefLoan, base: string) =>
  openingBalance(toBlock(l), {
    ...A0,
    baseDate: isoDate(base),
    postFixationResetRatePa: rate(String(l.ratePa)),
  });

describe("ADR 0235 case A: the reference's step rule gives the replay's opening", () => {
  for (const [name, { loan, bases }] of Object.entries(CASES)) {
    it(`${name}: the reference refuses the plain loan`, () => {
      expect(() =>
        referenceBalanceAt(loan, { resetRatePa: loan.ratePa }, "2026-06-07"),
      ).toThrow(RangeError);
    });

    it(`${name}: engine opening = reference step rule`, () => {
      for (const base of bases) {
        const ref = referenceBalanceAt(
          asTranche(loan),
          { resetRatePa: loan.ratePa },
          base,
        );
        expect(
          engine(loan, base).minus(ref.toString()).abs().toNumber(),
        ).toBeLessThanOrEqual(TIGHT);
      }
    });
  }

  it("before maturity the opening is the principal, at or after it 0", () => {
    const { loan } = CASES["2 M at 5 %, 8,000 Kč, 20 years"]!;
    expect(engine(loan, "2041-01-16").toString()).toBe("2000000");
    expect(engine(loan, "2041-01-17").toString()).toBe("0");
  });
});
