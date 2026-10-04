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
  instalmentAtMonth,
  lastPaymentMonth,
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

  it("a future development loan reports nothing, before or after its draw", () => {
    // Starts in grid month 4 (after three undrawn months), draws a tranche later.
    const future = {
      ...devBlock,
      id: "m-future-dev",
      startDate: isoDate("2026-09-15"),
      draws: [{ date: isoDate("2027-01-20"), amount: money(1000000) }],
    } as MortgageBlock;
    expect(outcomesOf(future)).toEqual([]);
  });

  it("no block: no rows, handovers or outcomes", () => {
    expect(propertySchedule([], assumptions)).toEqual({
      rows: [],
      refinances: [],
      eventOutcomes: [],
    });
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

  it("prepayments in one period apply in date order, not entry order", () => {
    // Both settle after the 2031-01-17 payment; the earlier-dated one goes first.
    const b = withEvents(javorova, [
      prepay("2031-01-15", 5000000),
      prepay("2031-01-05", 1000),
    ]);
    expect(
      outcomesOf(b).map((o) => [o.date.toISOString().slice(0, 10), o.issue]),
    ).toEqual([
      ["2031-01-05", null],
      ["2031-01-15", "PREPAYMENT_EXCEEDS_BALANCE"],
    ]);
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

  // The 480 payments left to the cap (payment 600) at 4.5 % need 6,232.0643 Kč on
  // 1,386,249.89: a haléř above runs out exactly at the cap, a haléř below one past it.
  it("an instalment that ends exactly on the cap is agreed, not capped", () => {
    const exact = withEvents(
      javorova,
      [],
      [toInstalment("2031-01-17", 6232.07)],
    );
    expect(outcomesOf(exact)[0].issue).toBeNull();
    const rows = buildSchedule(exact, assumptions);
    expect(rows[56].instalment.toFixed(2)).toBe("6232.07");
    expect(lastPayment(rows)).toBe(600 - 64);
    expect(
      outcomesOf(
        withEvents(javorova, [], [toInstalment("2031-01-17", 6232.06)]),
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

  it("a future loan's later maturity is built out to its last payment", () => {
    // Drawn in grid month 13 (2027-07-07); payment p falls in grid month 13 + p.
    const fut = {
      id: "f",
      propertyId: "f",
      startDate: isoDate("2027-06-17"),
      initialPrincipal: money(3000000),
      fixationYears: 5,
      interestRatePa: rate("0.05"),
      monthlyInstalment: money(16105),
      recasts: [toMaturity("2030-06-17", "2072-06-17")], // payment 540
    } as MortgageBlock;
    const rows = buildSchedule(fut, assumptions);
    expect(lastPayment(rows)).toBe(13 + 540);
    expect(rows).toHaveLength(13 + 540);
    expect(rows[13 + 540 - 1].endBalance.isZero()).toBe(true);
  });

  // A payoff past the contract schedule leaves the prepayment row last: there is no
  // next row to take the instalment from.
  it("reports the last row's instalment when that row prepays the loan off", () => {
    const rows = buildSchedule(
      withEvents(
        javorova,
        [prepay("2060-01-17", 5000000)], // payment 468, grid month 404
        [toMaturity("2031-01-17", "2066-01-17")],
      ),
      assumptions,
    );
    expect(rows).toHaveLength(404);
    const last = rows[403];
    expect(last.prepaid.greaterThan(0)).toBe(true);
    expect(last.principal.greaterThan(0)).toBe(true);
    expect(instalmentAtMonth(rows, 404)).toEqual({
      instalment: last.instalment,
      ratePa: last.ratePa,
    });
  });
});

describe("ADR 0116: reading a schedule with a prepayment in grid month 1", () => {
  // Payment 65 (17.06.2026) is grid month 1; a prepayment dated 10.06 follows it.
  it("month 1 reports the lowered instalment; baseDate (month 0) the one paid", () => {
    const rows = buildSchedule(
      withEvents(javorova, [prepay("2026-06-10", 100000)]),
      assumptions,
    );
    expect(rows[0]?.prepaid.toFixed(2)).toBe("100000.00");
    expect(rows[0]?.instalment.toFixed(2)).toBe("6721.80");
    expect(rows[1]?.instalment.toFixed(2)).toBe("6308.22");
    expect(instalmentAtMonth(rows, 1).instalment.toFixed(2)).toBe("6308.22");
    expect(instalmentAtMonth(rows, 0).instalment.toFixed(2)).toBe("6721.80");
  });

  it("a loan prepaid off in grid month 1 last pays in month 1", () => {
    const rows = buildSchedule(
      withEvents(javorova, [prepay("2026-06-10", 5000000)]),
      assumptions,
    );
    expect(lastPaymentMonth(rows)).toBe(1);
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

describe("ADR 0116 §2: a tranche on the maturity payment", () => {
  // A tranches-only development loan (no completion date, so no completion rule): the
  // maturity recast makes payment 17 (2027-08-01) the last one, and the second tranche,
  // dated 2027-07-20, follows that same payment. It restores the contract term instead
  // of being repaid in one shot.
  const b = withEvents(
    {
      ...devBlock,
      id: "m-dev",
      draws: [
        { date: isoDate("2026-11-15"), amount: money("1500000") },
        { date: isoDate("2027-07-20"), amount: money("1000000") },
      ],
      completionDate: undefined,
    } as MortgageBlock,
    undefined,
    [toMaturity("2027-01-10", "2027-08-01")],
  );

  it("keeps amortizing after the tranche's payment", () => {
    const rows = buildSchedule(b, assumptions);
    const t = rows.map((r) => r.drawn.greaterThan(0)).lastIndexOf(true);
    expect(rows[t].endBalance.greaterThan(0)).toBe(true);
    expect(rows[t + 1].principal.greaterThan(0)).toBe(true);
    expect(lastPayment(rows)).toBeGreaterThan(t + 300);
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

  // ADR 0116 §3: each dropped prepayment keeps its own entered fee, even when another
  // one has the same date and amount.
  it("charges each prepayment paid at the handover its own fee", () => {
    const s = propertySchedule(
      [
        withEvents(javorova, [
          prepay("2031-01-05", 100000, "lowerInstalment", 1000),
          prepay("2031-01-05", 100000, "lowerInstalment", 3000),
        ]),
        refi("2031-01-10"),
      ],
      assumptions,
    );
    expect(s.rows[55].prepaid.toFixed(0)).toBe("200000");
    expect(s.rows[55].prepaymentFee.toFixed(0)).toBe("4000");
    expect(s.eventOutcomes.map((o) => o.fee.toFixed(0))).toEqual([
      "1000",
      "3000",
    ]);
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
    expect(
      s.eventOutcomes.map((o) => [
        o.kind,
        o.issue,
        o.month,
        o.requested.toFixed(0),
      ]),
    ).toEqual([
      ["prepayment", "PREPAYMENT_REPLACED", null, "500000"],
      ["recast", "RECAST_REPLACED", null, "0"],
    ]);
  });

  // Javorova pays on the 17th, the grid runs on the 7th: a refinance on 2031-01-05
  // draws in grid month 55 (2031-01-07), while a prepayment dated 2031-01-03 follows the
  // 2031-01-17 payment in grid month 56, a row the successor replaces.
  it("a prepayment settling after the successor's draw month is paid at the handover", () => {
    const plain = propertySchedule([javorova, refi("2031-01-05")], assumptions);
    const s = propertySchedule(
      [
        withEvents(javorova, [prepay("2031-01-03", 100000)]),
        refi("2031-01-05"),
      ],
      assumptions,
    );
    expect(s.refinances[0].month).toBe(55);
    expect(s.refinances[0].paidOff.toFixed(6)).toBe(
      plain.refinances[0].paidOff.minus(100000).toFixed(6),
    );
    expect(s.eventOutcomes).toHaveLength(1);
    expect(s.eventOutcomes[0]).toMatchObject({ month: 55, issue: null });
    expect(s.eventOutcomes[0].applied.toFixed(0)).toBe("100000");
  });

  // D-47: a second successor drawn in the same grid month pays off what the first one
  // drew; the first handover's prepayment belongs to Javorova and is not paid twice.
  it("two successors in one grid month: the second pays off the first one's draw", () => {
    const second = {
      ...refi("2031-01-20"),
      id: "refi-2",
      initialPrincipal: money(1200000),
    } as MortgageBlock;
    const s = propertySchedule(
      [
        withEvents(javorova, [prepay("2031-01-05", 100000)]),
        { ...refi("2031-01-10"), initialPrincipal: money(1000000) },
        second,
      ],
      assumptions,
    );
    expect(
      s.refinances.map((r) => [
        r.month,
        r.paidOff.toFixed(2),
        r.drawn.toFixed(2),
      ]),
    ).toEqual([
      // Javorova's month-55 balance (1,391,012.68) less the prepayment.
      [56, "1291012.68", "1000000.00"],
      [56, "1000000.00", "1200000.00"],
    ]);
    expect(s.eventOutcomes).toHaveLength(1);
    expect(s.eventOutcomes[0]).toMatchObject({
      blockId: javorova.id,
      month: 56,
      issue: null,
    });
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
