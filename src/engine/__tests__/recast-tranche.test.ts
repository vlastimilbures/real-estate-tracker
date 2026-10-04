// ADR 0120 (#109): a development tranche landing on payment `q` of an instalment-form
// recast. Payment `q` pays the agreed instalment (ADR 0109 §6); the tranche's
// re-amortization (D-24) follows on `q+1`, over the recast maturity. Before, it was
// dropped: the instalment stayed sized for the smaller balance and the last payment
// repaid the rest in one go (a ~2.16 M Kč balloon with a 30-year fixation).
import { describe, it, expect } from "vitest";
import { money, rate } from "../brands";
import { isoDate } from "../dates";
import { D, type Decimal } from "../../lib/money";
import { buildSchedule, openingBalance } from "../schedule";
import type { AmortizationRow, MortgageBlock } from "../types";
import { assumptions } from "./support/seed";
import { annuityPayment, annuityPeriods } from "./reference/mortgageReference";

const AGREED = 15000;

/** 2,000,000 Kč at 4.9 % from 2026-03-01 over 30 years, no interest-only phase; one
 *  1,000,000 Kč tranche; the owner agrees 15,000 Kč from 2027-01-01. On the loan's
 *  cadence the recast follows payment 10 (2027-01-01), so `q` = payment 11 = grid
 *  month 8 (2027-02-07); a tranche dated 2027-01-15 lands on `q`, 2027-02-15 on `q+1`. */
function loan(trancheDate: string, fixationYears: number): MortgageBlock {
  return {
    id: "dev",
    propertyId: "p",
    startDate: isoDate("2026-03-01"),
    initialPrincipal: money(2000000),
    fixationYears,
    interestRatePa: rate("0.049"),
    monthlyInstalment: money(11000),
    loanTermYears: 30,
    draws: [{ date: isoDate(trancheDate), amount: money(1000000) }],
    recasts: [{ date: isoDate("2027-01-01"), instalment: money(AGREED) }],
  };
}

const Q = 8; // grid month of payment q
const at = (rows: AmortizationRow[], month: number): AmortizationRow => {
  const row = rows[month - 1];
  if (!row) throw new Error(`no row for month ${month}`);
  return row;
};
const sum = (rows: AmortizationRow[], f: (r: AmortizationRow) => Decimal) =>
  rows.reduce((s, r) => s.plus(f(r)), D(0));
const paying = (rows: AmortizationRow[]) =>
  rows.filter((r) => r.interest.plus(r.principal).greaterThan(0));
const lastPaying = (rows: AmortizationRow[]): AmortizationRow => {
  const row = paying(rows).at(-1);
  if (!row) throw new Error("no payment");
  return row;
};

describe("ADR 0120: a tranche on an instalment recast's payment q", () => {
  const r = D("0.049").div(12);

  it.each([30, 5])(
    "fixation %i y: q pays the agreed instalment, q+1 re-amortizes",
    (fix) => {
      const rows = buildSchedule(loan("2027-01-15", fix), assumptions);
      const q = at(rows, Q);
      expect(q.drawn.toNumber()).toBe(1000000);
      expect(q.instalment.toNumber()).toBe(AGREED);

      // The recast maturity, from the balance it was agreed on (after payment 10).
      const before = at(rows, Q - 1).endBalance;
      const left = Math.ceil(annuityPeriods(r, AGREED, before).toNumber());
      const lastMonth = Q - 1 + left;
      expect(lastPaying(rows).month).toBe(lastMonth);

      // q+1 pays the annuity of the balance after q over the payments left.
      const expected = annuityPayment(r, lastMonth - Q, q.endBalance);
      expect(
        at(rows, Q + 1)
          .instalment.minus(expected)
          .abs()
          .toNumber(),
      ).toBeLessThanOrEqual(0.01);
    },
  );

  it("fixation 30 y: no balloon at the recast maturity", () => {
    const rows = buildSchedule(loan("2027-01-15", 30), assumptions);
    const last = lastPaying(rows);
    expect(last.principal.lessThanOrEqualTo(at(rows, Q + 1).instalment)).toBe(
      true,
    );
  });

  it("fixation 5 y: the re-amortized instalment holds until the reset", () => {
    const rows = buildSchedule(loan("2027-01-15", 5), assumptions);
    const next = at(rows, Q + 1).instalment;
    expect(next.greaterThan(20000)).toBe(true);
    // Grid month 57 is the last payment before the 2031 reset (payment 60).
    expect(at(rows, 57).instalment.equals(next)).toBe(true);
  });

  it.each([30, 5])(
    "fixation %i y: Σ principal + Σ prepaid = opening debt + draws",
    (fix) => {
      const block = loan("2027-01-15", fix);
      const rows = buildSchedule(block, assumptions);
      const repaid = sum(rows, (x) => x.principal.plus(x.prepaid));
      const debt = openingBalance(block, assumptions).plus(
        sum(rows, (x) => x.drawn),
      );
      expect(repaid.minus(debt).abs().toNumber()).toBeLessThanOrEqual(1e-6);
    },
  );

  it.each([30, 5])(
    "fixation %i y: a tranche on q is close to the same tranche on q+1",
    (fix) => {
      const onQ = buildSchedule(loan("2027-01-15", fix), assumptions);
      const onNext = buildSchedule(loan("2027-02-15", fix), assumptions);
      // Both pay the same instalment from q+2 within a few hundred Kč.
      for (const m of [Q + 2, 40, 100]) {
        expect(
          at(onQ, m)
            .instalment.minus(at(onNext, m).instalment)
            .abs()
            .toNumber(),
        ).toBeLessThan(300);
      }
      const interest = (rows: AmortizationRow[]) =>
        sum(rows, (x) => x.interest).toNumber();
      expect(Math.abs(interest(onQ) - interest(onNext))).toBeLessThan(20000);
    },
  );

  it("replayed before baseDate: the opening carries the owed re-amortization", () => {
    const block = loan("2027-01-15", 30);
    const fromStart = buildSchedule(block, assumptions);
    // baseDate 2027-02-07: payment q (2027-02-01) is history, q+1 is grid month 1.
    const later = { ...assumptions, baseDate: isoDate("2027-02-07") };
    expect(
      openingBalance(block, later)
        .minus(at(fromStart, Q).endBalance)
        .toNumber(),
    ).toBe(0);
    const rows = buildSchedule(block, later);
    expect(
      at(rows, 1)
        .instalment.minus(at(fromStart, Q + 1).instalment)
        .toNumber(),
    ).toBe(0);
  });
});
