// ADR 0109: prepayments and recasts in the engine's schedules. The figures are the
// hand-checked ones the reference model pins (reference/loanEvents.reference.test.ts);
// loanEvents.crossCheck.test.ts compares every column with the reference.
import { describe, it, expect } from "vitest";
import { money, rate } from "../brands";
import { isoDate } from "../dates";
import { D } from "../../lib/money";
import {
  balanceAtMonth,
  buildSchedule,
  openingBalance,
  propertySchedule,
} from "../schedule";
import type {
  AmortizationRow,
  Assumptions,
  LoanEventOutcome,
  LoanRecast,
  MortgageBlock,
  MortgagePrepayment,
  PrepaymentEffect,
} from "../types";
import { assumptions, portfolio } from "./support/seed";
import { devBlock } from "./support/mixed";

const seedJavorova = portfolio.mortgages.find(
  (m) => m.propertyId === "javorova",
);
if (!seedJavorova) throw new Error("seed block missing");
const javorova: MortgageBlock = seedJavorova;

const prepay = (
  date: string,
  amount: string | number,
  effect: PrepaymentEffect = "lowerInstalment",
  fee?: string | number,
): MortgagePrepayment => ({
  date: isoDate(date),
  amount: money(amount),
  effect,
  fee: fee == null ? undefined : money(fee),
});
const toMaturity = (date: string, maturity: string): LoanRecast => ({
  date: isoDate(date),
  maturity: isoDate(maturity),
});
const toInstalment = (date: string, instalment: number): LoanRecast => ({
  date: isoDate(date),
  instalment: money(instalment),
});

const withEvents = (
  b: MortgageBlock,
  prepayments?: MortgagePrepayment[],
  recasts?: LoanRecast[],
): MortgageBlock => ({ ...b, prepayments, recasts }) as MortgageBlock;

/** Grid month of the last row that pays anything. */
const lastPayment = (rows: AmortizationRow[]) =>
  rows.reduce(
    (last, r) =>
      r.interest.plus(r.principal).plus(r.prepaid).greaterThan(0)
        ? r.month
        : last,
    0,
  );

const outcomesOf = (b: MortgageBlock, a: Assumptions = assumptions) =>
  propertySchedule([b], a).eventOutcomes;

describe("ADR 0109: inert without events", () => {
  it("empty lists give the schedule without them", () => {
    const plain = buildSchedule(javorova, assumptions);
    expect(buildSchedule(withEvents(javorova, [], []), assumptions)).toEqual(
      plain,
    );
    expect(plain.every((r) => r.prepaid.isZero())).toBe(true);
    expect(plain.every((r) => r.prepaymentFee.isZero())).toBe(true);
    expect(outcomesOf(javorova)).toEqual([]);
  });
});

describe("ADR 0109: Javorova prepays 500,000 Kč on 2031-01-17", () => {
  it("is applied after payment 120 (grid month 56)", () => {
    const rows = buildSchedule(
      withEvents(javorova, [prepay("2031-01-17", 500000)]),
      assumptions,
    );
    const row = rows[55];
    expect(row.interest.toFixed(1)).toBe("1959.0");
    expect(row.principal.toFixed(1)).toBe("4762.8");
    expect(row.prepaid.toFixed(0)).toBe("500000");
    expect(row.endBalance.toFixed(2)).toBe("886249.89");
  });

  it("(a) lower instalment: 5,550.1866 from the reset, maturity kept", () => {
    const rows = buildSchedule(
      withEvents(javorova, [prepay("2031-01-17", 500000)]),
      assumptions,
    );
    expect(rows[56].instalment.toFixed(4)).toBe("5550.1866");
    expect(lastPayment(rows)).toBe(300);
  });

  it("(b) shorten term: 266 payments, reset instalment 7,893.8980, payoff 2043-03", () => {
    const rows = buildSchedule(
      withEvents(javorova, [prepay("2031-01-17", 500000, "shortenTerm")]),
      assumptions,
    );
    expect(rows[56].instalment.toFixed(4)).toBe("7893.8980");
    expect(lastPayment(rows)).toBe(202);
    expect(rows[201].endBalance.isZero()).toBe(true);
    expect(rows[201].principal.greaterThan(0)).toBe(true);
    // The rows after payoff are zero rows to the contract schedule's end.
    expect(rows).toHaveLength(buildSchedule(javorova, assumptions).length);
  });

  it("both effects repay the same principal; a shorter term pays less interest", () => {
    const run = (effect: PrepaymentEffect) =>
      buildSchedule(
        withEvents(javorova, [prepay("2031-01-17", 500000, effect)]),
        assumptions,
      );
    const total = (rows: AmortizationRow[], f: (r: AmortizationRow) => D) =>
      rows.reduce((s, r) => s.plus(f(r)), D(0));
    type D = ReturnType<typeof D>;
    const [a, b] = [run("lowerInstalment"), run("shortenTerm")];
    const repaid = (rows: AmortizationRow[]) =>
      total(rows, (r) => r.principal.plus(r.prepaid));
    const opening = openingBalance(javorova, assumptions);
    expect(repaid(a).minus(opening).abs().toNumber()).toBeLessThan(1e-6);
    expect(repaid(b).minus(opening).abs().toNumber()).toBeLessThan(1e-6);
    expect(
      total(b, (r) => r.interest).lessThan(total(a, (r) => r.interest)),
    ).toBe(true);
  });

  it("carries the entered fee on the row, as cash, not principal", () => {
    const rows = buildSchedule(
      withEvents(javorova, [prepay("2031-01-17", 500000, "shortenTerm", 3000)]),
      assumptions,
    );
    expect(rows[55].prepaymentFee.toFixed(0)).toBe("3000");
    expect(rows[55].prepaid.toFixed(0)).toBe("500000");
  });
});

describe("ADR 0109: clamps are reported, not raised", () => {
  it("a prepayment equal to the balance pays the loan off", () => {
    const rows = buildSchedule(javorova, assumptions);
    const balance = rows[55].endBalance;
    const paid = buildSchedule(
      withEvents(javorova, [
        {
          ...prepay("2031-01-17", 1, "shortenTerm"),
          amount: money(balance.toString()),
        },
      ]),
      assumptions,
    );
    expect(paid[55].endBalance.isZero()).toBe(true);
    expect(paid.slice(56).every((r) => r.instalment.isZero())).toBe(true);
    expect(lastPayment(paid)).toBe(56);
  });

  it("above the balance: clamped, and reported", () => {
    const b = withEvents(javorova, [
      prepay("2031-01-17", 5000000, "lowerInstalment", 100),
    ]);
    const rows = buildSchedule(b, assumptions);
    const owed = buildSchedule(javorova, assumptions)[55].endBalance;
    expect(rows[55].prepaid.toFixed(6)).toBe(owed.toFixed(6));
    expect(rows[55].endBalance.isZero()).toBe(true);
    const [o] = outcomesOf(b);
    expect(o).toMatchObject({
      blockId: javorova.id,
      kind: "prepayment",
      month: 56,
      issue: "PREPAYMENT_EXCEEDS_BALANCE",
    });
    expect(o.applied.toFixed(2)).toBe(rows[55].prepaid.toFixed(2));
    expect(o.fee.toFixed(0)).toBe("100");
  });

  it("after payoff: nothing applied, no fee, reported", () => {
    const b = withEvents(javorova, [
      prepay("2030-01-17", 5000000),
      prepay("2031-01-17", 1000, "lowerInstalment", 500),
    ]);
    const rows = buildSchedule(b, assumptions);
    expect(rows[55].prepaid.isZero()).toBe(true);
    expect(rows[55].prepaymentFee.isZero()).toBe(true);
    const second = outcomesOf(b)[1];
    expect(second.issue).toBe("PREPAYMENT_AFTER_PAYOFF");
    expect(second.applied.isZero()).toBe(true);
    expect(second.fee.isZero()).toBe(true);
  });

  it("a recast after payoff is reported", () => {
    const b = withEvents(
      javorova,
      [prepay("2030-01-17", 5000000)],
      [toMaturity("2031-01-17", "2045-01-17")],
    );
    expect(outcomesOf(b).map((o) => o.issue)).toEqual([
      "PREPAYMENT_EXCEEDS_BALANCE",
      "RECAST_AFTER_PAYOFF",
    ]);
  });

  it("an instalment below the next interest, and one past the cap, are reported", () => {
    expect(
      outcomesOf(
        withEvents(javorova, [], [toInstalment("2031-01-17", 5000)]),
      )[0].issue,
    ).toBe("RECAST_INSTALMENT_BELOW_INTEREST");
    expect(
      outcomesOf(
        withEvents(javorova, [], [toInstalment("2031-01-17", 6000)]),
      )[0].issue,
    ).toBe("RECAST_TERM_CAPPED");
  });
});

describe("ADR 0109: placement on the loan's own payments", () => {
  it("an off-cycle date gives the same balance forward and replayed", () => {
    const b = withEvents(javorova, [
      prepay("2031-01-20", 500000, "shortenTerm"),
    ]);
    const forward = buildSchedule(b, assumptions);
    // 2031-06-07 is grid month 60 of the 2026-06-07 grid.
    const later = { ...assumptions, baseDate: isoDate("2031-06-07") };
    expect(
      openingBalance(b, later)
        .minus(balanceAtMonth(forward, 60))
        .abs()
        .toNumber(),
    ).toBeLessThan(1e-6);
  });

  it("replays a prepayment before baseDate into the opening balance", () => {
    const open = (effect: PrepaymentEffect) =>
      openingBalance(
        withEvents(javorova, [prepay("2024-01-17", 200000, effect)]),
        assumptions,
      );
    expect(open("lowerInstalment").toFixed(4)).toBe("1456700.7213");
    expect(open("shortenTerm").toFixed(4)).toBe("1434868.8531");
    const rows = buildSchedule(
      withEvents(javorova, [prepay("2024-01-17", 200000)]),
      assumptions,
    );
    expect(rows.every((r) => r.prepaid.isZero())).toBe(true);
    expect(balanceAtMonth(rows, 0).toFixed(4)).toBe("1456700.7213");
    expect(
      outcomesOf(withEvents(javorova, [prepay("2024-01-17", 200000)]))[0].month,
    ).toBeLessThanOrEqual(0);
  });

  // ADR 0116 §1: an event dated after the last payment due on or before baseDate, and on
  // or before baseDate itself, settles right after that payment. Its placement therefore
  // depends on baseDate by less than one period. Javorova pays on the 17th.
  it("a late-window event settles after the last payment due by baseDate", () => {
    const b = withEvents(javorova, [
      prepay("2031-05-20", 500000, "shortenTerm"),
    ]);
    const at = (base: string) => ({ ...assumptions, baseDate: isoDate(base) });
    const plain = buildSchedule(javorova, at("2031-05-25"));

    // Base 05-25: history, taken off right after the 05-17 payment.
    const late = buildSchedule(b, at("2031-05-25"));
    expect(late.every((r) => r.prepaid.isZero())).toBe(true);
    expect(balanceAtMonth(late, 0).toFixed(4)).toBe(
      balanceAtMonth(plain, 0).minus(500000).toFixed(4),
    );

    // Base 05-19: forward, applied after the 06-17 payment in grid row 1.
    const early = buildSchedule(b, at("2031-05-19"));
    expect(early[0].prepaid.toFixed(4)).toBe("500000.0000");

    // Row 1 is the 06-17 payment in both grids: its interest differs by one month on
    // 500,000.
    expect(
      early[0].interest
        .minus(late[0].interest)
        .minus(D(500000).times(early[0].ratePa).div(12))
        .abs()
        .toNumber(),
    ).toBeLessThan(1e-9);
    // Same instalment (shortenTerm), so the late grid repays exactly that much more.
    expect(
      balanceAtMonth(early, 1)
        .minus(balanceAtMonth(late, 1))
        .minus(early[0].interest.minus(late[0].interest))
        .abs()
        .toNumber(),
    ).toBeLessThan(1e-9);
  });

  it("a future loan's prepayment follows its first payment, never the draw row", () => {
    const fut = {
      id: "f",
      propertyId: "f",
      startDate: isoDate("2027-01-15"),
      initialPrincipal: money(1500000),
      fixationYears: 5,
      interestRatePa: rate("0.04"),
      monthlyInstalment: money(8000),
      prepayments: [prepay("2027-01-20", 100000)],
    } as MortgageBlock;
    const rows = buildSchedule(fut, assumptions);
    const drawIdx = rows.findIndex((r) => r.drawn.greaterThan(0));
    expect(rows[drawIdx].prepaid.isZero()).toBe(true);
    expect(rows[drawIdx + 1].prepaid.toFixed(0)).toBe("100000");
    expect(balanceAtMonth(rows, 0).isZero()).toBe(true);
  });
});

describe("ADR 0109: recasts", () => {
  const base = buildSchedule(javorova, assumptions);

  it("a later maturity lowers the instalment and runs the schedule past the contract", () => {
    const rows = buildSchedule(
      withEvents(javorova, [], [toMaturity("2031-01-17", "2060-01-17")]),
      assumptions,
    );
    expect(rows[56].instalment.lessThan(base[56].instalment)).toBe(true);
    // 2060-01-17 is payment 468 = grid month 404; nothing is owed after it.
    expect(rows).toHaveLength(404);
    expect(lastPayment(rows)).toBe(404);
    expect(rows.at(-1)?.endBalance.isZero()).toBe(true);
  });

  it("an earlier maturity raises the instalment and keeps the contract length", () => {
    const rows = buildSchedule(
      withEvents(javorova, [], [toMaturity("2031-01-17", "2045-01-17")]),
      assumptions,
    );
    expect(rows[56].instalment.greaterThan(base[56].instalment)).toBe(true);
    expect(lastPayment(rows)).toBe(288 - 64);
    expect(rows).toHaveLength(base.length);
  });

  it("an instalment recast at the reset pays exactly that amount first", () => {
    const rows = buildSchedule(
      withEvents(
        javorova,
        [prepay("2031-01-17", 500000)],
        [toInstalment("2031-01-17", 6000)],
      ),
      assumptions,
    );
    expect(rows[56].instalment.toFixed(4)).toBe("6000.0000");
    expect(rows[56].ratePa.toFixed(3)).toBe("0.045");
    expect(lastPayment(rows)).toBe(336 - 64);
  });

  it("an instalment past the cap is trimmed to 50 years from the start", () => {
    const rows = buildSchedule(
      withEvents(javorova, [], [toInstalment("2031-01-17", 6000)]),
      assumptions,
    );
    expect(lastPayment(rows)).toBe(600 - 64);
    expect(rows).toHaveLength(600 - 64);
  });

  it("after a shortened term, a recast back restores the original maturity", () => {
    const rows = buildSchedule(
      withEvents(
        javorova,
        [prepay("2031-01-17", 500000, "shortenTerm")],
        [toMaturity("2033-01-17", "2051-05-17")],
      ),
      assumptions,
    );
    expect(lastPayment(rows)).toBe(300);
    expect(rows[80].instalment.lessThan(rows[79].instalment)).toBe(true);
  });
});

describe("ADR 0109: development loans", () => {
  const dev = (prepayments?: MortgagePrepayment[], recasts?: LoanRecast[]) =>
    withEvents(
      { ...devBlock, id: "m-dev" } as MortgageBlock,
      prepayments,
      recasts,
    );

  it("during interest-only both effects give the same rows", () => {
    const lowerRows = buildSchedule(
      dev([prepay("2027-01-10", 200000)]),
      assumptions,
    );
    const shortRows = buildSchedule(
      dev([prepay("2027-01-10", 200000, "shortenTerm")]),
      assumptions,
    );
    expect(shortRows).toEqual(lowerRows);
  });

  it("lowers the interest-only payment and the instalment set at completion", () => {
    const plain = buildSchedule(dev(), assumptions);
    const rows = buildSchedule(
      dev([prepay("2027-01-10", 200000)]),
      assumptions,
    );
    const i = rows.findIndex((r) => r.prepaid.greaterThan(0));
    expect(rows[i + 1].interest.lessThan(plain[i + 1].interest)).toBe(true);
    expect(rows[i + 1].principal.isZero()).toBe(true); // still interest-only
    const done = rows.findIndex((r, j) => j > i && r.principal.greaterThan(0));
    expect(rows[done].instalment.lessThan(plain[done].instalment)).toBe(true);
  });

  it("charges the fee and reports nothing when the prepayment fits", () => {
    const b = dev([prepay("2027-01-10", 200000, "lowerInstalment", 4000)]);
    const rows = buildSchedule(b, assumptions);
    expect(
      rows.reduce((s, r) => s.plus(r.prepaymentFee), D(0)).toFixed(0),
    ).toBe("4000");
    expect(outcomesOf(b).map((o: LoanEventOutcome) => o.issue)).toEqual([null]);
  });

  it("a maturity recast during interest-only applies at completion", () => {
    const plain = buildSchedule(dev(), assumptions);
    const rows = buildSchedule(
      dev(undefined, [toMaturity("2027-01-10", "2050-03-01")]),
      assumptions,
    );
    const done = plain.findIndex((r) => r.principal.greaterThan(0));
    expect(rows[done].instalment.greaterThan(plain[done].instalment)).toBe(
      true,
    );
  });
});

describe("ADR 0109: refinance handovers", () => {
  const refi = (start: string): MortgageBlock =>
    ({
      id: "refi",
      propertyId: javorova.propertyId,
      startDate: isoDate(start),
      initialPrincipal: money(1633000),
      fixationYears: 5,
      interestRatePa: rate("0.039"),
      monthlyInstalment: money(9800),
    }) as MortgageBlock;

  it("a prepayment on the refix date is paid before the successor takes over", () => {
    const s = propertySchedule(
      [
        withEvents(javorova, [prepay("2031-01-17", 500000)]),
        refi("2031-01-17"),
      ],
      assumptions,
    );
    expect(s.refinances[0].paidOff.toFixed(2)).toBe("886249.89");
    expect(s.rows[55].prepaid.toFixed(0)).toBe("500000");
  });

  it("a prepayment in a dropped payment period is paid at the handover", () => {
    const plain = propertySchedule([javorova, refi("2031-01-10")], assumptions);
    const s = propertySchedule(
      [
        withEvents(javorova, [
          prepay("2031-01-05", 500000, "lowerInstalment", 3000),
        ]),
        refi("2031-01-10"),
      ],
      assumptions,
    );
    expect(s.refinances[0].paidOff.toFixed(6)).toBe(
      plain.refinances[0].paidOff.minus(500000).toFixed(6),
    );
    expect(s.rows[55].prepaid.toFixed(0)).toBe("500000");
    expect(s.rows[55].prepaymentFee.toFixed(0)).toBe("3000");
    expect(s.eventOutcomes[0]).toMatchObject({ month: 56, issue: null });
  });

  it("events after the successor's start are dropped and reported", () => {
    const s = propertySchedule(
      [
        withEvents(
          javorova,
          [prepay("2031-03-01", 500000)],
          [toMaturity("2031-03-01", "2045-01-17")],
        ),
        refi("2031-01-17"),
      ],
      assumptions,
    );
    expect(s.rows.every((r) => r.prepaid.isZero())).toBe(true);
    expect(s.eventOutcomes.map((o) => [o.issue, o.month])).toEqual([
      ["PREPAYMENT_REPLACED", null],
      ["RECAST_REPLACED", null],
    ]);
  });

  it("a recast in the handover period no longer applies", () => {
    const s = propertySchedule(
      [
        withEvents(javorova, [], [toMaturity("2031-01-17", "2045-01-17")]),
        refi("2031-01-17"),
      ],
      assumptions,
    );
    expect(s.eventOutcomes[0]).toMatchObject({
      issue: "RECAST_REPLACED",
      month: null,
    });
  });
});
