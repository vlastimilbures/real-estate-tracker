// ADR 0164 (#112, probe G2-6-01): each amortization row carries the due date of the
// payment it holds, on the paying block's own cadence EDATE(startDate, p), next to the
// grid date EDATE(baseDate, m) the projection buckets by. Rows with no payment due
// (undrawn, the draw row, repaid, a handover row the successor's draw replaces) have
// none. Javorova pays on the 17th; baseDate is the 7th, so the grid date is 21 days
// after each due date.
import { describe, it, expect } from "vitest";
import { mortgageBlock } from "../amortization";
import { money, rate } from "../brands";
import { edate, isoDate } from "../dates";
import { propertyLoanExposure } from "../financing";
import { buildSchedule, paymentOffset, propertySchedule } from "../schedule";
import type { AmortizationRow, MortgageBlock } from "../types";
import { assumptions, BASE_DATE, portfolio } from "./support/seed";
import { devBlock, mixed } from "./support/mixed";

const javorova = portfolio.mortgages.find((m) => m.propertyId === "javorova")!;
const iso = (d: Date | null) => d?.toISOString().slice(0, 10) ?? null;
const paid = (r: AmortizationRow) =>
  r.interest.plus(r.principal).greaterThan(0);

/** Every paid row is due on EDATE(start, offset + m); every other row has no due date. */
function expectOwnCadence(block: MortgageBlock, rows: AmortizationRow[]) {
  const offset = paymentOffset(block, assumptions.baseDate);
  for (const r of rows) {
    const want = paid(r) ? iso(edate(block.startDate, offset + r.month)) : null;
    expect(iso(r.dueDate), `month ${r.month}`).toBe(want);
  }
}

describe("ADR 0164: amortization rows carry the payment due date", () => {
  it("Javorova: payment 56 is due 17.01.2031, its grid date stays 07.02.2031", () => {
    const rows = buildSchedule(javorova, assumptions);
    expect(iso(rows[0]!.date)).toBe("2026-07-07");
    expect(iso(rows[0]!.dueDate)).toBe("2026-06-17");
    expect(iso(rows[55]!.date)).toBe("2031-02-07");
    expect(iso(rows[55]!.dueDate)).toBe("2031-01-17");
    expect(rows[56]!.ratePa.toString()).toBe("0.045");
    expect(iso(rows[56]!.dueDate)).toBe("2031-02-17");
  });

  it("Javorova: every payment is due on the 17th, on the loan's own cadence", () => {
    const rows = buildSchedule(javorova, assumptions);
    expectOwnCadence(javorova, rows);
    expect(rows.filter(paid).every((r) => r.dueDate!.getUTCDate() === 17)).toBe(
      true,
    );
  });

  it("a future loan: no due date until its first payment, a month after the start", () => {
    const future = mixed.mortgages.find((m) => m.id === "m-future")!;
    const rows = buildSchedule(future, assumptions);
    const first = rows.findIndex(paid);
    expect(first).toBeGreaterThan(0);
    expect(rows.slice(0, first).every((r) => r.dueDate === null)).toBe(true);
    expect(rows[first - 1]!.drawn.toString()).toBe("4200000");
    expect(iso(rows[first]!.dueDate)).toBe("2028-04-15");
    expectOwnCadence(future, rows);
  });

  it("a start on the 31st is due on the last day of a shorter month", () => {
    const block: MortgageBlock = {
      ...javorova,
      id: "m-eom",
      startDate: isoDate("2027-01-31"),
      initialPrincipal: money("1000000"),
      monthlyInstalment: money("5000"),
    };
    const rows = buildSchedule(block, assumptions);
    const dues = rows.filter(paid).map((r) => iso(r.dueDate));
    expect(dues.slice(0, 3)).toEqual([
      "2027-02-28",
      "2027-03-31",
      "2027-04-30",
    ]);
    expectOwnCadence(block, rows);
  });

  it("a development loan: the first draw row has none, interest-only rows do", () => {
    const block = mortgageBlock({
      ...devBlock,
      startDate: isoDate("2026-09-10"),
      draws: [{ date: isoDate("2027-02-15"), amount: money("1000000") }],
    });
    const rows = buildSchedule(block, assumptions);
    const drawRow = rows.findIndex((r) => r.drawn.greaterThan(0));
    expect(rows[drawRow]!.dueDate).toBeNull();
    expect(iso(rows[drawRow + 1]!.dueDate)).toBe("2026-10-10");
    expect(rows[drawRow + 1]!.principal.toString()).toBe("0");
    expectOwnCadence(block, rows);
    expectOwnCadence(devBlock, buildSchedule(devBlock, assumptions));
  });

  it("a repaid loan's trailing rows have no due date", () => {
    const block: MortgageBlock = {
      ...javorova,
      prepayments: [
        {
          date: isoDate("2031-01-17"),
          amount: money("5000000"),
          effect: "shortenTerm",
        },
      ],
    };
    const rows = buildSchedule(block, assumptions);
    expect(iso(rows[55]!.dueDate)).toBe("2031-01-17");
    expect(rows[55]!.endBalance.toString()).toBe("0");
    expect(rows.slice(56).every((r) => r.dueDate === null)).toBe(true);
  });

  describe("a refinance handover", () => {
    const refi = (start: string, principal: string): MortgageBlock => ({
      id: "m-refi",
      propertyId: "javorova",
      startDate: isoDate(start),
      initialPrincipal: money(principal),
      fixationYears: 5,
      interestRatePa: rate("0.039"),
      monthlyInstalment: money("9800"),
    });

    it("a kept handover row carries the owner's due date, then the successor's", () => {
      const s = propertySchedule(
        [javorova, refi("2031-01-17", "1386000")],
        assumptions,
      );
      expect(s.refinances[0]!.month).toBe(56);
      expect(iso(s.rows[55]!.dueDate)).toBe("2031-01-17");
      expect(iso(s.rows[56]!.dueDate)).toBe("2031-02-17");
    });

    it("a replaced handover row has none; the successor pays on its own day", () => {
      const s = propertySchedule(
        [javorova, refi("2031-01-10", "1400000")],
        assumptions,
      );
      expect(s.refinances[0]!.month).toBe(56);
      expect(s.rows[55]!.dueDate).toBeNull();
      expect(iso(s.rows[56]!.dueDate)).toBe("2031-02-10");
    });
  });

  it("the Financing payoff is the last payment row's due date", () => {
    for (const blocks of [
      [javorova],
      mixed.mortgages.filter((m) => m.propertyId === "dev"),
    ]) {
      const s = propertySchedule(blocks, assumptions);
      const loan = propertyLoanExposure(blocks, assumptions, s, BASE_DATE)!;
      const last = s.rows.filter(paid).at(-1)!;
      expect(iso(loan.loan.payoffDate)).toBe(iso(last.dueDate));
    }
  });
});
