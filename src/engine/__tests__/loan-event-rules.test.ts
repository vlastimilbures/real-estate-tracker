// #130 R1-07: one hand-computed figure per loan-event rule, from the ADR text and the
// annuity formulas in `lib/money` (FV, PMT, NPER), never from the engine's or the
// reference model's event code. The engine must reproduce each to 1e-6 Kč.
//
// Plain loan L: 1,200,000 Kč at 6 % (r = 0.5 % a month) from 2026-01-07, instalment
// ceil(PMT) over 240 payments, fixed for 30 years, so no reset interferes. baseDate
// 2026-06-07: payments 1–5 are made. Events dated 2026-09-07 (payment 8's due date)
// apply after payment 8 (ADR 0109 §3), on the balance
//   B8 = 1,200,000 · 1.005^8 − A · (1.005^8 − 1) / 0.005  (= −FV).
import { describe, it, expect } from "vitest";
import { D, FV, NPER, PMT, type Decimal } from "../../lib/money";
import { isoDate } from "../dates";
import { openingBalance, paymentOffset, propertySchedule } from "../schedule";
import type { AmortizationRow, Assumptions } from "../types";
import type { RefLoan } from "./reference/mortgageReference";
import { TIGHT, toBlock } from "./reference/eventHarness";
import { assumptions as A0 } from "./support/seed";

const BASE = "2026-06-07";
const at = (base: string): Assumptions => ({ ...A0, baseDate: isoDate(base) });
const r = D("0.005");
const P = D(1200000);
const A = PMT(r, 240, P.negated()).ceil();
const L: RefLoan = {
  start: "2026-01-07",
  principal: "1200000",
  ratePa: "0.06",
  instalment: A.toString(),
  fixationMonths: 360,
};
/** Balance after `k` payments of `a` on `p`. */
const balance = (k: number, a: Decimal, p: Decimal = P) =>
  FV(r, k, a.negated(), p).negated();
const B8 = balance(8, A);

function schedule(loan: RefLoan, base = BASE) {
  const block = toBlock(loan);
  const s = propertySchedule([block], at(base));
  const offset = paymentOffset(block, isoDate(base));
  /** The row of payment `p`. */
  const row = (p: number): AmortizationRow => {
    const x = s.rows[p - offset - 1];
    if (!x) throw new Error(`no row for payment ${p}`);
    return x;
  };
  const paying = s.rows.filter((x) =>
    x.interest.plus(x.principal).plus(x.prepaid).gt(0),
  );
  const last = offset + (paying.at(-1)?.month ?? 0);
  return { ...s, row, last };
}
const near = (a: Decimal, b: Decimal) =>
  expect(a.minus(b).abs().toNumber()).toBeLessThanOrEqual(TIGHT);

describe("#130 R1-07: hand-computed loan-event rules (ADR 0109)", () => {
  it("the plain loan runs its 240 payments", () => {
    const s = schedule(L);
    expect(s.last).toBe(240);
    near(s.row(8).endBalance, B8);
  });

  it("§5 shortenTerm: the instalment is kept, the term ends after ceil(NPER) more", () => {
    const s = schedule({
      ...L,
      prepayments: [
        { date: "2026-09-07", amount: "100000", effect: "shortenTerm" },
      ],
    });
    near(s.row(8).prepaid, D(100000));
    expect(s.row(9).instalment.toString()).toBe(A.toString());
    const left = NPER(r, A.negated(), B8.minus(100000)).ceil().toNumber();
    expect(s.last).toBe(8 + left);
  });

  it("§5 lowerInstalment: the maturity is kept, payment 9 re-amortizes", () => {
    const s = schedule({
      ...L,
      prepayments: [
        { date: "2026-09-07", amount: "100000", effect: "lowerInstalment" },
      ],
    });
    near(s.row(9).instalment, PMT(r, 240 - 8, B8.minus(100000).negated()));
    expect(s.last).toBe(240);
  });

  it("§6 maturity recast: payment 9 is the annuity to the new last payment", () => {
    const s = schedule({
      ...L,
      recasts: [{ date: "2026-09-07", maturity: "2051-01-07" }], // payment 300
    });
    near(s.row(9).instalment, PMT(r, 300 - 8, B8.negated()));
    expect(s.last).toBe(300);
  });

  it("§6 instalment recast: payment 9 pays it, the loan ends at 8 + ceil(NPER)", () => {
    const s = schedule({
      ...L,
      recasts: [{ date: "2026-09-07", instalment: "8000" }],
    });
    expect(s.row(9).instalment.toString()).toBe("8000");
    const left = NPER(r, D(-8000), B8).ceil().toNumber();
    expect(s.last).toBe(8 + left);
    near(s.row(8 + left - 1).endBalance, balance(left - 1, D(8000), B8));
  });

  it("§6 instalment recast on a reset: payment q pays it at the reset rate", () => {
    // Fixed 1 year: payment 12 (2027-01-07) is the last at 6 %, payment 13 resets to
    // the assumed 4.5 %. A recast dated on payment 12 sets payment 13 to 7,000.
    const s = schedule({
      ...L,
      fixationMonths: 12,
      recasts: [{ date: "2027-01-07", instalment: "7000" }],
    });
    const b12 = balance(12, A);
    const q = s.row(13);
    expect(q.instalment.toString()).toBe("7000");
    near(q.interest, b12.times(A0.postFixationResetRatePa).div(12));
    near(q.principal, D(7000).minus(q.interest));
  });
});

describe("#130 R1-07: hand-computed late-window and interest-only rules (ADR 0129)", () => {
  // Development loan D: 100,000 Kč at 6 % from 2026-01-15, term 300, no completion, so
  // it amortizes from payment 1 at the annuity of the principal over the term (D-31).
  // Tranche 1,000,000 on 04-20, after payment 3 (04-15); prepayment 300,000 on 04-25.
  // With baseDate 04-28 both are in the late window: the prepayment sees the tranche
  // (§1) and applies in full. The baseDate debt is B3 + 1,000,000 − 300,000: it counts
  // the tranche once (D-44), which re-amortizes in grid month 1 (D-41).
  it("§1: a late prepayment after a late tranche applies in full", () => {
    const loan: RefLoan = {
      start: "2026-01-15",
      principal: "100000",
      ratePa: "0.06",
      instalment: "600",
      fixationMonths: 60,
      termMonths: 300,
      draws: [{ date: "2026-04-20", amount: "1000000" }],
      prepayments: [
        { date: "2026-04-25", amount: "300000", effect: "lowerInstalment" },
      ],
    };
    const s = schedule(loan, "2026-04-28");
    const [o] = s.eventOutcomes;
    expect(o.issue).toBeNull();
    near(o.applied, D(300000));
    const a = PMT(r, 300, D(-100000));
    const b3 = balance(3, a, D(100000));
    near(
      openingBalance(toBlock(loan), at("2026-04-28")),
      b3.plus(1000000).minus(300000),
    );
  });

  // Development loan with completion 2027-03-10, paying on the 8th: payment 14 (due
  // 2027-03-08) is still interest-only (§2), payment 15 re-amortizes the full 3,000,000
  // over the 346 payments left.
  it("§2: interest-only up to the last payment due by completion", () => {
    const s = schedule({
      start: "2026-01-08",
      principal: "3000000",
      ratePa: "0.06",
      instalment: "16000",
      fixationMonths: 60,
      termMonths: 360,
      completion: "2027-03-10",
    });
    near(s.row(14).interest, D(15000));
    expect(s.row(14).principal.isZero()).toBe(true);
    near(s.row(15).instalment, PMT(r, 346, D(-3000000)));
  });
});
