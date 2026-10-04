// ADR 0129 §2 (#135 R1-04): a development loan's payment is interest-only when its due
// date EDATE(start, p) is on or before completion, in the history part and the grid
// alike, as the rate is (D-21). Loan paying on the 8th; completion 2027-03-10, so
// payment 14 (due 2027-03-08) is the last interest-only one, whatever baseDate's day.
import { describe, it, expect } from "vitest";
import { isoDate } from "../dates";
import { buildSchedule, paymentOffset } from "../schedule";
import type { AmortizationRow } from "../types";
import type { RefLoan } from "./reference/mortgageReference";
import { both, maxDev, TIGHT, toBlock } from "./reference/eventHarness";
import { assumptions } from "./support/seed";

const loan: RefLoan = {
  start: "2026-01-08",
  principal: 3000000,
  ratePa: 0.05,
  instalment: 16000,
  fixationMonths: 60,
  termMonths: 360,
  completion: "2027-03-10",
};
const block = toBlock(loan);

/** Grid row of payment `p` with baseDate `base`. */
function payment(base: string, p: number): AmortizationRow {
  const a = { ...assumptions, baseDate: isoDate(base) };
  const row = buildSchedule(block, a)[p - paymentOffset(block, a.baseDate) - 1];
  if (!row) throw new Error(`no row for payment ${p}`);
  return row;
}

describe("ADR 0129 §2: interest-only is read on the due date", () => {
  it.each(["2026-06-07", "2026-06-09"])(
    "payment 14 is interest-only with baseDate %s",
    (base) => {
      const p14 = payment(base, 14);
      expect(p14.interest.toFixed(2)).toBe("12500.00");
      expect(p14.principal.toFixed(2)).toBe("0.00");
      expect(p14.endBalance.toFixed(2)).toBe("3000000.00");
    },
  );

  it("payment 15 amortizes to the same balance on either baseDate day", () => {
    const early = payment("2026-06-07", 15);
    const late = payment("2026-06-09", 15);
    expect(early.principal.greaterThan(0)).toBe(true);
    expect(early.endBalance.toFixed(6)).toBe(late.endBalance.toFixed(6));
    expect(early.instalment.toFixed(6)).toBe(late.instalment.toFixed(6));
  });

  it.each(["2026-06-07", "2026-06-09"])(
    "matches the reference model with baseDate %s",
    (base) => {
      const { e, r } = both(loan, base);
      expect(maxDev(e, r)).toBeLessThan(TIGHT);
    },
  );

  it("a future loan reads it on the due date too", () => {
    const future: RefLoan = {
      ...loan,
      start: "2026-08-20",
      completion: "2027-09-25",
    };
    const { e, r } = both(future, "2026-06-07");
    expect(maxDev(e, r)).toBeLessThan(TIGHT);
    // Payment 13 is due 2027-09-20, before completion: interest-only, on grid month
    // 2027-10-07 (after completion).
    const due = isoDate("2027-10-07").getTime();
    const p13 = e.find((row) => row.date.getTime() === due);
    expect(p13?.interest.greaterThan(0)).toBe(true);
    expect(p13?.principal.toFixed(2)).toBe("0.00");
  });
});
