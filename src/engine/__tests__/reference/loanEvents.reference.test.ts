// ADR 0109: the reference model's prepayments and recasts on Javorova, pinned to
// hand-checked figures before the engine is compared with it (crossCheck).
// 500,000 Kč on 2031-01-17 follows payment 120 (the fixation end, still at 1.69 %),
// which leaves 886,249.89; payment 121 is the first at the 4.5 % reset.
import { describe, it, expect } from "vitest";
import {
  annuityPayment,
  firstPaymentOnOrAfter,
  referenceBalanceAt,
  referenceSchedule,
  type RefLoan,
  type RefRow,
} from "./mortgageReference";
import { BASE, RESET, SEED_LOANS } from "./seedLoans";

const OPTS = {
  baseDate: BASE,
  months: 360,
  resetRatePa: RESET,
  calendar: "gridDueDate" as const,
};
const javorova = SEED_LOANS.javorova;
const run = (loan: Partial<RefLoan>) =>
  referenceSchedule({ ...javorova, ...loan }, OPTS);
/** Grid month of the last payment that pays anything. */
const lastPayment = (rows: RefRow[]) =>
  rows.reduce((last, r) => (r.payment.greaterThan(0) ? r.month : last), 0);

describe("ADR 0109 reference: prepayment at the 2031 fixation end", () => {
  it("follows payment 120 in grid row 56", () => {
    expect(firstPaymentOnOrAfter(javorova.start, "2031-01-17")).toBe(120);
    const row = run({
      prepayments: [
        { date: "2031-01-17", amount: 500000, effect: "lowerInstalment" },
      ],
    })[55];
    expect(row.interest.toFixed(1)).toBe("1959.0");
    expect(row.principal.toFixed(1)).toBe("4762.8");
    expect(row.prepaid.toFixed(0)).toBe("500000");
    expect(row.endBalance.toFixed(2)).toBe("886249.89");
  });

  it("lower instalment: PMT(4.5 %/12, 244, balance) from payment 121", () => {
    const rows = run({
      prepayments: [
        { date: "2031-01-17", amount: 500000, effect: "lowerInstalment" },
      ],
    });
    const expected = annuityPayment(0.045 / 12, 244, rows[55].endBalance);
    expect(rows[56].instalment.toFixed(4)).toBe(expected.toFixed(4));
    expect(rows[56].instalment.toFixed(4)).toBe("5550.1866");
    expect(lastPayment(rows)).toBe(300);
  });

  it("shorten term: 146 more payments, re-amortized over them at the reset", () => {
    const rows = run({
      prepayments: [
        { date: "2031-01-17", amount: 500000, effect: "shortenTerm" },
      ],
    });
    expect(rows[56].instalment.toFixed(4)).toBe("7893.8980");
    // Last payment 266 = grid month 202, due 2043-03-17.
    expect(lastPayment(rows)).toBe(202);
    expect(rows[201].endBalance.isZero()).toBe(true);
  });

  it("both effects repay the same principal; shorten pays less interest", () => {
    const sum = (rows: RefRow[], f: (r: RefRow) => RefRow["interest"]) =>
      rows.reduce((s, r) => s.plus(f(r)), rows[0].interest.times(0));
    const lower = run({
      prepayments: [
        { date: "2031-01-17", amount: 500000, effect: "lowerInstalment" },
      ],
    });
    const shorter = run({
      prepayments: [
        { date: "2031-01-17", amount: 500000, effect: "shortenTerm" },
      ],
    });
    const repaid = (rows: RefRow[]) =>
      sum(rows, (r) => r.principal.plus(r.prepaid));
    expect(repaid(lower).toFixed(6)).toBe(repaid(shorter).toFixed(6));
    expect(repaid(lower).toFixed(2)).toBe("1642907.31");
    expect(
      sum(shorter, (r) => r.interest).lessThan(sum(lower, (r) => r.interest)),
    ).toBe(true);
  });
});

describe("ADR 0109 reference: replay before baseDate", () => {
  it("200,000 Kč on 2024-01-17 (after payment 36) lowers the opening debt", () => {
    const opening = (effect: "lowerInstalment" | "shortenTerm") =>
      referenceBalanceAt(
        {
          ...javorova,
          prepayments: [{ date: "2024-01-17", amount: 200000, effect }],
        },
        { resetRatePa: RESET },
        BASE,
      );
    expect(opening("lowerInstalment").toFixed(4)).toBe("1456700.7213");
    expect(opening("shortenTerm").toFixed(4)).toBe("1434868.8531");
  });
});

describe("ADR 0109 reference: recasts", () => {
  it("an instalment of 6,000 after the prepayment: last payment 120 + ceil(NPER)", () => {
    const rows = run({
      prepayments: [
        { date: "2031-01-17", amount: 500000, effect: "lowerInstalment" },
      ],
      recasts: [{ date: "2031-01-17", instalment: 6000 }],
    });
    // Payment 121 pays exactly the agreed instalment although it is the reset.
    expect(rows[56].instalment.toFixed(4)).toBe("6000.0000");
    expect(rows[56].ratePa.toFixed(3)).toBe("0.045");
    const last = lastPayment(rows) + 64; // grid month + payments due at baseDate
    expect(last).toBe(336);
  });

  it("an instalment that would run past 50 years re-amortizes to the cap", () => {
    // 6,000 on 1,386,249.9 at 4.5 % needs 538 more payments: 658 > 600.
    const rows = referenceSchedule(
      { ...javorova, recasts: [{ date: "2031-01-17", instalment: 6000 }] },
      { ...OPTS, months: 560 },
    );
    const expected = annuityPayment(0.045 / 12, 480, rows[55].endBalance);
    expect(rows[56].instalment.toFixed(4)).toBe(expected.toFixed(4));
    expect(lastPayment(rows) + 64).toBe(600);
  });

  it("an instalment below the next payment's interest is ignored", () => {
    const rows = run({ recasts: [{ date: "2031-01-17", instalment: 5000 }] });
    expect(rows[56].instalment.toFixed(4)).toBe(
      run({})[56].instalment.toFixed(4),
    );
  });

  it("a later maturity lowers the instalment, an earlier one raises it", () => {
    const base = run({})[56].instalment;
    const later = run({
      recasts: [{ date: "2031-01-17", maturity: "2055-01-17" }],
    });
    const earlier = run({
      recasts: [{ date: "2031-01-17", maturity: "2045-01-17" }],
    });
    expect(later[56].instalment.lessThan(base)).toBe(true);
    expect(earlier[56].instalment.greaterThan(base)).toBe(true);
    // Last payment due on the new maturity: 2045-01-17 is payment 288.
    expect(lastPayment(earlier) + 64).toBe(288);
  });

  it("shorten, then recast back to the original maturity: lower instalment from then", () => {
    const shortenThenBack = run({
      prepayments: [
        { date: "2031-01-17", amount: 500000, effect: "shortenTerm" },
      ],
      recasts: [{ date: "2033-01-17", maturity: "2051-05-17" }],
    });
    const lower = run({
      prepayments: [
        { date: "2031-01-17", amount: 500000, effect: "lowerInstalment" },
      ],
    });
    // From payment 145 (grid 81) both run to payment 364 (grid 300).
    expect(lastPayment(shortenThenBack)).toBe(300);
    expect(lastPayment(lower)).toBe(300);
    expect(
      shortenThenBack[80].instalment.lessThan(shortenThenBack[79].instalment),
    ).toBe(true);
  });
});
