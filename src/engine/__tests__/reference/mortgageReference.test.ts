// Self-checks of the independent reference model against the hand-derived annuity
// figures (closed-form PMT/NPER/FV). The model imports nothing from the engine or lib.
import { describe, it, expect } from "vitest";
import {
  addMonths,
  annuityPayment,
  annuityPeriods,
  paymentsMadeBy,
  referenceBalanceAt,
  referenceChain,
  referenceSchedule,
  termOf,
} from "./mortgageReference";
import { BASE, RESET, SEED_LOANS } from "./seedLoans";

const near = (actual: { toNumber(): number }, expected: number, tol: number) =>
  expect(Math.abs(actual.toNumber() - expected)).toBeLessThanOrEqual(tol);

describe("reference dates", () => {
  it("addMonths clamps to month end (EDATE)", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2024-01-31", 1)).toBe("2024-02-29");
    expect(addMonths("2024-02-29", 12)).toBe("2025-02-28");
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
  });
  it("paymentsMadeBy counts due dates on/before the date", () => {
    expect(paymentsMadeBy("2021-01-17", BASE)).toBe(64);
    expect(paymentsMadeBy("2022-01-15", BASE)).toBe(52);
    expect(paymentsMadeBy("2024-03-12", BASE)).toBe(26);
    // A 31st start: the payment clamped to 28 Feb is due by 28 Feb.
    expect(paymentsMadeBy("2026-01-31", "2026-02-28")).toBe(1);
  });
});

describe("reference annuity maths", () => {
  it("360-month annuities (Appendix A)", () => {
    near(annuityPayment(0.0169 / 12, 360, 1912500), 6776.19, 0.01);
    near(annuityPayment(0.0359 / 12, 360, 5610000), 25474.09, 0.01);
    near(annuityPayment(0.0449 / 12, 360, 3034500), 15357.34, 0.01);
    near(annuityPayment(0.0449 / 12, 200, 3034500), 21578.16, 0.01);
  });
  it("derived terms: NPER 363.80 / 357.66 / 200.02 → 364 / 358 / 201", () => {
    near(annuityPeriods(0.0169 / 12, 6721.8, 1912500), 363.8, 0.01);
    near(annuityPeriods(0.0359 / 12, 25567.15, 5610000), 357.66, 0.01);
    near(annuityPeriods(0.0449 / 12, 21576.4, 3034500), 200.02, 0.01);
    expect(termOf(SEED_LOANS.javorova)).toBe(364);
    expect(termOf(SEED_LOANS.lipova)).toBe(358);
    expect(termOf(SEED_LOANS.dubova)).toBe(201);
  });
  it("0 % rate: straight-line", () => {
    expect(annuityPayment(0, 240, 2400000).toNumber()).toBe(10000);
    expect(annuityPeriods(0, 10000, 2400000).toNumber()).toBe(240);
  });
});

describe("reference balances at baseDate (Appendix A)", () => {
  const cases: [string, number][] = [
    ["javorova", 1642907.31],
    ["lipova", 5116588.94],
    ["dubova", 2755908.88],
  ];
  for (const [id, want] of cases) {
    it(id, () => {
      near(
        referenceBalanceAt(SEED_LOANS[id], { resetRatePa: RESET }, BASE),
        want,
        0.005,
      );
    });
  }
});

describe("reference schedule — Javorova (Appendix A)", () => {
  const rows = referenceSchedule(SEED_LOANS.javorova, {
    baseDate: BASE,
    months: 360,
    resetRatePa: RESET,
  });
  const row = (m: number) => rows[m - 1];
  it("month 1 split", () => {
    near(row(1).interest, 2313.8, 0.05);
    near(row(1).principal, 4408.0, 0.05);
    near(row(1).endBalance, 1638499.3, 0.05);
  });
  it("month 55 (last fixed month)", () => {
    near(row(55).interest, 1965.7, 0.05);
    near(row(55).endBalance, 1391012.7, 0.05);
    expect(row(55).ratePa.toNumber()).toBe(0.0169);
  });
  it("month 56 reset: 4.5 %, instalment 8,689.54 over 245 months", () => {
    expect(row(56).ratePa.toNumber()).toBe(0.045);
    near(row(56).instalment, 8689.54, 0.005);
    near(row(56).interest, 5216.3, 0.05);
    near(row(56).principal, 3473.2, 0.05);
    near(row(56).endBalance, 1387539.4, 0.05);
  });
  it("month 300 pays off; Σ principal = opening balance", () => {
    near(row(300).endBalance, 0, 1e-9);
    near(row(300).principal, 8657.1, 0.05);
    const sum = rows.reduce(
      (s, r) => s.plus(r.principal),
      rows[0].principal.times(0),
    );
    near(sum, 1642907.31, 0.005);
  });
});

describe("reference schedule — Javorova on the J-03 a′ calendar (D-21)", () => {
  const rows = referenceSchedule(SEED_LOANS.javorova, {
    baseDate: BASE,
    months: 360,
    resetRatePa: RESET,
    calendar: "gridDueDate",
  });
  const row = (m: number) => rows[m - 1];
  it("month 56 (payment due on the fixation end 2031-01-17) stays at the fixed rate", () => {
    expect(row(56).date).toBe("2031-02-07");
    expect(row(56).ratePa.toNumber()).toBe(0.0169);
    near(row(56).instalment, 6721.8, 1e-9);
    near(row(56).interest, 1959.0, 0.05);
    near(row(56).principal, 4762.8, 0.05);
    near(row(56).endBalance, 1386249.9, 0.05);
  });
  it("month 57 resets to 4.5 %: instalment 8,681.46 over 244 months", () => {
    expect(row(57).ratePa.toNumber()).toBe(0.045);
    near(row(57).instalment, 8681.46, 0.005);
    near(row(57).interest, 5198.4, 0.05);
    near(row(57).principal, 3483.0, 0.05);
    near(row(57).endBalance, 1382766.9, 0.05);
  });
  it("month 300 pays off; Σ principal = opening balance", () => {
    near(row(300).endBalance, 0, 1e-9);
    near(row(300).principal, 8649.0, 0.05);
    const sum = rows.reduce(
      (s, r) => s.plus(r.principal),
      rows[0].principal.times(0),
    );
    near(sum, 1642907.31, 0.005);
  });
});

describe("reference input validation (never NaN, never a loop)", () => {
  const base = SEED_LOANS.dubova;
  it("rejects instalment ≤ first-month interest", () => {
    expect(() => termOf({ ...base, instalment: "11354.0875" })).toThrow(
      RangeError,
    );
    expect(() =>
      referenceSchedule(
        { ...base, instalment: "10000" },
        {
          baseDate: BASE,
          months: 12,
          resetRatePa: RESET,
        },
      ),
    ).toThrow(RangeError);
  });
  it("rejects a 0 instalment at 0 %", () => {
    expect(() => termOf({ ...base, ratePa: "0", instalment: "0" })).toThrow(
      RangeError,
    );
  });
  it("rejects a development loan without a term", () => {
    expect(() => termOf({ ...base, completion: "2026-12-31" })).toThrow(
      RangeError,
    );
  });
});

describe("reference opening draws (D-41)", () => {
  // Start 20 Jan 2026: payments 1–4 due by baseDate 7 Jun; the tranche on 1 Jun lands
  // after the last payment (20 May), before baseDate.
  const loan = {
    start: "2026-01-20",
    principal: "1000000",
    ratePa: "0.05",
    instalment: "5000",
    fixationMonths: 60,
    termMonths: 360,
    draws: [{ date: "2026-06-01", amount: "500000" }],
  };
  const run = (openingDraws: "fold" | "nextPeriod") =>
    referenceSchedule(loan, {
      baseDate: BASE,
      months: 360,
      resetRatePa: RESET,
      calendar: "gridDueDate",
      devInstalment: "fromTerm",
      openingDraws,
    });
  const opening = (r: ReturnType<typeof run>) =>
    r[0].endBalance.plus(r[0].principal).minus(r[0].draw);

  it("fold: the tranche is in the opening balance and does not re-amortize", () => {
    const r = run("fold");
    expect(r[0].draw.isZero()).toBe(true);
    near(opening(r), 1495163.68, 0.01);
    expect(r[0].instalment.equals(r[1].instalment)).toBe(true);
  });

  it("nextPeriod: the tranche lands in grid month 1 and re-amortizes there", () => {
    const fold = run("fold");
    const r = run("nextPeriod");
    near(r[0].draw, 500000, 0);
    // Same balance before the split, so the same opening debt including the tranche.
    near(opening(r).plus(r[0].draw), opening(fold).toNumber(), 1e-9);
    expect(r[0].instalment.greaterThan(fold[0].instalment)).toBe(true);
    // The balance amortizes to zero; Σ principal = opening debt + the tranche.
    const sum = r.reduce(
      (s, x) => s.plus(x.principal),
      r[0].principal.times(0),
    );
    near(sum, opening(r).plus(r[0].draw).toNumber(), 1e-9);
    near(r[r.length - 1].endBalance, 0, 1e-9);
  });
});

describe("reference first draw of a future loan (D-46)", () => {
  // Start 20 Jun 2026 and a tranche on 1 Jul both land in grid month 1 (to 7 Jul).
  const loan = {
    start: "2026-06-20",
    principal: "1200000",
    ratePa: "0.04",
    instalment: "0",
    fixationMonths: 60,
    termMonths: 240,
    draws: [{ date: "2026-07-01", amount: "300000" }],
  };
  const run = (openingDraws: "fold" | "nextPeriod") =>
    referenceSchedule(loan, {
      baseDate: BASE,
      months: 260,
      resetRatePa: RESET,
      calendar: "gridDueDate",
      devInstalment: "fromTerm",
      openingDraws,
    });

  it("both modes draw the tranche with the loan", () => {
    near(run("fold")[0].endBalance, 1500000, 0);
    near(run("nextPeriod")[0].endBalance, 1500000, 0);
  });

  it("nextPeriod sizes the instalment on the combined draw over the full term", () => {
    const want = annuityPayment(0.04 / 12, 240, 1500000).toNumber();
    near(run("nextPeriod")[1].instalment, want, 1e-9);
    const fold = annuityPayment(0.04 / 12, 240, 1200000).toNumber();
    near(run("fold")[1].instalment, fold, 1e-9);
    // Paid off at the term, with Σ principal = the combined draw.
    const r = run("nextPeriod");
    const sum = r.reduce(
      (s, x) => s.plus(x.principal),
      r[0].principal.times(0),
    );
    near(sum, 1500000, 1e-6);
  });
});

describe("reference last tranche lands by payment term−1 (ADR 0139)", () => {
  // Start 31 Jan 2026, 24 months: the last valid draw is on payment 23's due date,
  // 31 Dec 2027. A baseDate grid on the 28th or 30th dates the row carrying payment 23
  // before it; the tranche still joins that row, not the final payment (#218).
  const loan = {
    start: "2026-01-31",
    principal: "100000",
    ratePa: "0.05",
    instalment: "0",
    fixationMonths: 60,
    termMonths: 24,
    draws: [{ date: "2027-12-31", amount: "500000" }],
  };
  const cases: [string, number][] = [
    ["2026-02-28", 1],
    ["2026-04-30", 3],
  ];
  for (const [base, paid] of cases) {
    it(`baseDate ${base}: payment 23 carries the tranche`, () => {
      const r = referenceSchedule(loan, {
        baseDate: base,
        months: 30,
        resetRatePa: RESET,
        calendar: "gridDueDate",
        devInstalment: "fromTerm",
        openingDraws: "nextPeriod",
      });
      const row23 = r[23 - paid - 1];
      expect(row23.date).toBe(addMonths(base, 23 - paid));
      near(row23.draw, 500000, 0);
      // The last payment is one annuity payment, not a one-shot payoff (504,359.06).
      const last = r[24 - paid - 1];
      near(last.endBalance, 0, 1e-9);
      near(last.payment, row23.payment.toNumber(), 0.01);
      expect(last.principal.lessThan(300000)).toBe(true);
      const sum = r.reduce(
        (s, x) => s.plus(x.principal),
        r[0].principal.times(0),
      );
      near(
        sum,
        r[0].endBalance.plus(r[0].principal).plus(500000).toNumber(),
        1e-6,
      );
    });
  }
});

describe("reference refinance chain (D-47)", () => {
  // 0 % loans so every figure is hand-checkable. A: 4 payments due by baseDate
  // (17 Feb–17 May) ⇒ 116,000; grid month m carries payment 4 + m, due on the 17th.
  const A = {
    start: "2026-01-17",
    principal: "120000",
    ratePa: "0",
    instalment: "1000",
    fixationMonths: 60,
  };
  const B = (start: string) => ({
    start,
    principal: "50000",
    ratePa: "0",
    instalment: "500",
    fixationMonths: 60,
  });
  const opts = { baseDate: BASE, months: 120, resetRatePa: "0" };

  it("keeps the predecessor payment due on the successor's start", () => {
    // B starts 17 Sep ⇒ draws in grid month 4 (7 Oct), which carries A's 17 Sep payment.
    const { rows, handovers } = referenceChain([B("2026-09-17"), A], opts);
    expect(handovers).toHaveLength(1);
    expect(handovers[0].month).toBe(4);
    near(handovers[0].paidOff, 112000, 0);
    near(handovers[0].drawn, 50000, 0);
    near(rows[2].endBalance, 113000, 0);
    near(rows[3].principal, 1000, 0);
    near(rows[3].endBalance, 50000, 0);
    near(rows[4].principal, 500, 0);
    near(rows[4].endBalance, 49500, 0);
  });

  it("drops a predecessor payment due after the successor's start", () => {
    // B starts 10 Sep: A's 17 Sep payment is after it; A pays off 113,000.
    const { rows, handovers } = referenceChain([A, B("2026-09-10")], opts);
    expect(handovers[0].month).toBe(4);
    near(handovers[0].paidOff, 113000, 0);
    near(rows[3].principal, 0, 0);
    near(rows[3].endBalance, 50000, 0);
    near(rows[4].endBalance, 49500, 0);
  });

  it("seed Javorova refixed on its fixation end pays off the m56 parity balance", () => {
    const refi = {
      start: "2031-01-17",
      principal: "1633000",
      ratePa: "0.039",
      instalment: "9800",
      fixationMonths: 60,
    };
    const { rows, handovers } = referenceChain([SEED_LOANS.javorova, refi], {
      baseDate: BASE,
      months: 360,
      resetRatePa: RESET,
    });
    expect(handovers[0].month).toBe(56);
    near(handovers[0].paidOff, 1386249.9, 0.1); // engine-parity m56 end balance
    near(rows[55].ratePa, 0.0169, 0);
    near(rows[55].principal, 4762.8, 0.1);
    near(rows[55].endBalance, 1633000, 0);
    near(rows[56].ratePa, 0.039, 0);
  });
});
