// #130 R1-07: loan-event properties that need neither the engine's nor the reference
// model's rules to state. The reference copies the engine's event state machine, so
// engine = reference checks arithmetic, not rules; these check the rules from the ADR
// text and run on the same random loans (`reference/loanGen.ts`).
//
// baseDate shift (ADR 0021 D-21, ADR 0116 §1, ADR 0129): moving baseDate inside one
// payment period (the same payments due) changes no payment. Two things may move, by
// design: a tranche dated after baseDate lands on the baseDate grid (D-44), and an event
// dated between the two baseDates settles one payment earlier under the later one (it is
// in the late window there). The amount such an event applies may differ only by what
// that one payment repaid (ADR 0129 §1).
//
// End of the loan (ADR 0109 §4, D-40): the loan is repaid by the maturity in force,
// which only the contract term, a recast or a `shortenTerm` sets; the balance never goes
// negative and ends at zero. The last payment is no balloon (R1-01 was a 2.16 M Kč one)
// unless the inputs ask for it: a recast to a maturity one or two payments away, a capped
// or too-low agreed instalment, or a tranche in the last two payments.
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { D, NPER, type Decimal } from "../../lib/money";
import { addDays, edate, isoDate } from "../dates";
import { paymentOnOrAfter, paymentsDueBy } from "../amortization";
import { MAX_LOAN_TERM_MONTHS } from "../constants";
import { openingBalance, paymentOffset, propertySchedule } from "../schedule";
import type { AmortizationRow, Assumptions, LoanEventOutcome } from "../types";
import type { RefLoan } from "./reference/mortgageReference";
import { TIGHT, toBlock } from "./reference/eventHarness";
import { isValid, loanWithEvents, share, shockOf } from "./reference/loanGen";
import { fcRuns } from "./support/fcRuns";
import { assumptions as A0 } from "./support/seed";

// Fixed seed ⇒ reproducible in CI; nightly runs 2000 with a date seed (`fcRuns`).
const { runs: RUNS, timeout: TIMEOUT } = fcRuns(20261005, 200);

/** A rate shock, if the loan has one (`shockOf`). */
type Extra = Partial<Assumptions>;
const at = (base: string, extra: Extra = {}): Assumptions => ({
  ...A0,
  baseDate: isoDate(base),
  ...extra,
});
const iso = (d: Date) => d.toISOString().slice(0, 10);
const days = (a: string, b: string) =>
  (Date.parse(b) - Date.parse(a)) / 86_400_000;
const sum = (rows: AmortizationRow[], f: (r: AmortizationRow) => Decimal) =>
  rows.reduce((s, r) => s.plus(f(r)), D(0));
const dev = (a: Decimal, b: Decimal) => a.minus(b).abs().toNumber();

function run(loan: RefLoan, base: string, extra: Extra = {}) {
  const block = toBlock(loan);
  const s = propertySchedule([block], at(base, extra));
  return { ...s, opening: openingBalance(block, at(base, extra)) };
}

/** Grid month of the last row that pays anything. */
const lastPaying = (rows: AmortizationRow[]) =>
  rows.filter((r) => r.interest.plus(r.principal).plus(r.prepaid).gt(0)).at(-1)
    ?.month ?? 0;

/** Grid month a tranche dated `date` joins with baseDate `base`: month 1 when it is
 *  dated on/before baseDate (D-41), else the first grid date on/after it (D-44). */
function landing(base: string, date: string): number {
  if (date <= base) return 1;
  let m = 1;
  while (iso(edate(isoDate(base), m)) < date) m++;
  return m;
}

/**
 * #228: with baseDate `base`, a `shortenTerm` prepayment in the late window settles after
 * the payment a recast follows, after the recast, and sizes the term on the instalment
 * before it (an instalment recast then ends in a balloon). ADR 0109 §3 settles a
 * period's prepayments before its recast. Known wrong today; excluded until #228 is fixed.
 */
function hits228(loan: RefLoan, base: string): boolean {
  const block = toBlock(loan);
  const o = paymentsDueBy(block, isoDate(base));
  const lastDue = iso(edate(block.startDate, o));
  return (
    (loan.prepayments ?? []).some(
      (p) => p.effect === "shortenTerm" && p.date > lastDue && p.date <= base,
    ) &&
    (loan.recasts ?? []).some(
      (r) => paymentOnOrAfter(block, isoDate(r.date)) === o,
    )
  );
}

type Prepay = NonNullable<RefLoan["prepayments"]>[number];

/** `late` cases whose end of loan was compared are `lateTerm`. */
type Shift = "equal" | "late" | "lateTerm" | "skipped";

/**
 * Checks one loan at baseDates b1 < b2 with the same payments due, and says which case
 * it was. `equal`: no event dated in (b1, b2] and every tranche lands in the same grid
 * month, so every row and outcome is equal. `late`: prepayments dated in (b1, b2] settle
 * after payment o+1 under b1 and after payment o under b2; they apply the same amount
 * up to what payment o+1 repaid, and the loan ends within a few payments. `skipped`: a
 * recast in (b1, b2], a tranche landing differently, or a tranche that grid month 1
 * counts under b1 but a late event under b2 does not see (ADR 0129, "What stays as it
 * is").
 */
function checkShift(
  loan: RefLoan,
  b1: string,
  b2: string,
  extra: Extra = {},
): Shift {
  const block = toBlock(loan);
  const o = paymentsDueBy(block, isoDate(b1));
  expect(paymentsDueBy(block, isoDate(b2))).toBe(o);
  const draws = loan.draws ?? [];
  if (draws.some((x) => landing(b1, x.date) !== landing(b2, x.date)))
    return "skipped";
  const inWindow = (d: string) => d > b1 && d <= b2;
  const moved = (loan.prepayments ?? []).filter((p) => inWindow(p.date));
  if ((loan.recasts ?? []).some((r) => inWindow(r.date))) return "skipped";
  const first = moved[0]?.date;
  const nextGrid = iso(edate(isoDate(b1), 1));
  if (first && draws.some((x) => x.date > first && x.date <= nextGrid))
    return "skipped";
  // Under b2 the window's events follow payment o, under b1 payment o+1. Their term
  // answer is comparable only when o and o+1 are alike: not when o is the last
  // interest-only payment (a `shortenTerm` there acts like `lowerInstalment`, ADR 0109
  // §5), nor the last fixed-rate one (`shortenTerm` reads the rate of its payment,
  // #164), nor when a rate shock prices o+1 but not o (history, ADR 0079 §3), nor when
  // a tranche re-amortizes o+1 (D-41), nor when another event also follows o or o+1
  // (the window's prepayment then shares a period with it: the last effect wins, §5).
  const dueO = iso(edate(block.startDate, o));
  const fix = loan.fixationMonths;
  const shock = extra.rateShock;
  const termComparable =
    !(loan.completion && dueO <= loan.completion) &&
    o !== fix &&
    !(shock && o + 1 > fix && o + 1 <= fix + shock.durationYears * 12) &&
    !draws.some((x) => x.date > dueO && x.date <= nextGrid) &&
    ![...(loan.prepayments ?? []), ...(loan.recasts ?? [])].some((e) => {
      const p = paymentOnOrAfter(block, isoDate(e.date));
      return !inWindow(e.date) && (p === o || p === o + 1);
    });

  const one = run(loan, b1, extra);
  const two = run(loan, b2, extra);
  expect(two.eventOutcomes.length).toBe(one.eventOutcomes.length);
  // The debt taken on: opening + new draws, plus what the late events under b2 took
  // off the opening balance (under b1 they are in the rows).
  /** The outcome of a prepayment: the n-th one dated `p.date` that requested its
   *  amount (two may share a date). */
  const outcome = (s: ReturnType<typeof run>, p: Prepay) => {
    const n = moved
      .filter((q) => q.date === p.date && Number(q.amount) === Number(p.amount))
      .indexOf(p);
    const e = s.eventOutcomes.filter(
      (x) =>
        x.kind === "prepayment" &&
        iso(x.date) === p.date &&
        x.requested.equals(String(p.amount)),
    )[n];
    if (!e) throw new Error(`no outcome for ${p.date}`);
    return e;
  };
  const lateApplied = moved.reduce(
    (t, p) => t.plus(outcome(two, p).applied),
    D(0),
  );
  const debt = (s: ReturnType<typeof run>) =>
    s.opening.plus(sum(s.rows, (r) => r.drawn));
  expect(dev(debt(one), debt(two).plus(lateApplied))).toBeLessThanOrEqual(
    TIGHT,
  );

  if (moved.length === 0) {
    expect(two.rows.length).toBe(one.rows.length);
    for (let i = 0; i < one.rows.length; i++) {
      const [x, y] = [one.rows[i], two.rows[i]];
      for (const c of [
        "ratePa",
        "instalment",
        "interest",
        "principal",
        "prepaid",
        "prepaymentFee",
        "refinanced",
        "endBalance",
      ] as const)
        expect(dev(x[c], y[c]), `row ${i + 1} ${c}`).toBeLessThanOrEqual(TIGHT);
      if (i > 0) expect(dev(x.drawn, y.drawn)).toBeLessThanOrEqual(TIGHT);
    }
    const key = (e: LoanEventOutcome) => [
      e.kind,
      iso(e.date),
      e.month,
      e.issue,
      e.applied.toFixed(6),
      e.fee.toFixed(6),
    ];
    expect(two.eventOutcomes.map(key)).toEqual(one.eventOutcomes.map(key));
    return "equal";
  }

  // Under b1 the window's events follow payment o+1 (grid month 1); under b2 they are
  // in the late window and follow payment o (month 0). Payment o+1 repaid at most
  // `slack` more under b2 than under b1. The loan's last payment moves by a few
  // payments only: each term answer rounds `ceil(NPER)`, a prepayment can clear the
  // loan one payment earlier, and under b2 the prepaid amount X saves one more month of
  // interest, X·r, which grows to X·r·(1+r)^N by the end: that many instalments more.
  // Not compared when a prepayment is clamped under one baseDate only (it then clears
  // the loan there).
  const issues = (s: ReturnType<typeof run>) =>
    s.eventOutcomes.map((e) => e.issue).join();
  const termChecked = termComparable && issues(one) === issues(two);
  // No paying row: the late events repaid the loan; nothing left to compare.
  const paying = one.rows.filter((x) => x.instalment.gt(0));
  if (termChecked && paying.length > 0) {
    const r = Math.max(...paying.map((x) => x.ratePa.toNumber())) / 12;
    const n = lastPaying(one.rows);
    const minA = Math.min(...paying.map((x) => x.instalment.toNumber()));
    const interest = lateApplied.toNumber() * r * (1 + r) ** n;
    expect(
      Math.abs(lastPaying(one.rows) - lastPaying(two.rows)),
      "last payment month",
    ).toBeLessThanOrEqual(3 + Math.ceil(interest / minA));
  }
  const slack = one.rows[0].principal.plus(TIGHT);
  for (const p of moved) {
    const [x, y] = [outcome(one, p), outcome(two, p)];
    expect(x.month).toBe(1);
    expect(y.month).toBe(0);
    expect(
      x.applied.minus(y.applied).abs().lessThanOrEqualTo(slack),
      `${p.date}: applied ${x.applied} at ${b1}, ${y.applied} at ${b2}`,
    ).toBe(true);
  }
  return termChecked && paying.length > 0 ? "lateTerm" : "late";
}

/** The contract term in payments: explicit, or ceil(NPER) of the entered instalment. */
function contractTerm(loan: RefLoan): number {
  if (loan.termMonths != null) return loan.termMonths;
  const r = D(String(loan.ratePa)).div(12);
  return NPER(r, D(String(loan.instalment)).negated(), String(loan.principal))
    .ceil()
    .toNumber();
}

/** A payment's interest + principal (the instalment actually paid). */
const paid = (r: AmortizationRow) => r.interest.plus(r.principal);

/** Checks how one loan ends with baseDate `base` (see the header). */
function checkEnd(loan: RefLoan, base: string, extra: Extra = {}): void {
  const block = toBlock(loan);
  const s = run(loan, base, extra);
  const offset = paymentOffset(block, isoDate(base));
  for (const r of s.rows)
    expect(r.endBalance.isNegative(), `row ${r.month} balance`).toBe(false);
  const paying = s.rows.filter((r) => paid(r).plus(r.prepaid).gt(0));
  const last = paying.at(-1);
  if (!last) {
    // Repaid before baseDate (or by a late prepayment): nothing is owed.
    expect(s.opening.isZero()).toBe(true);
    return;
  }
  expect(last.endBalance.toNumber(), "balance after the last payment").toBe(0);
  for (const r of s.rows.slice(last.month))
    expect(r.endBalance.isZero() && r.drawn.isZero()).toBe(true);

  // No payment after the latest maturity anything may set. An instalment recast may
  // reach the cap (ADR 0109 §6), so with one this bounds little.
  const contract = contractTerm(loan);
  const recasts = loan.recasts ?? [];
  const bound = Math.max(
    contract,
    ...recasts.map((r) =>
      "maturity" in r
        ? paymentsDueBy(block, isoDate(r.maturity))
        : Math.max(MAX_LOAN_TERM_MONTHS, contract),
    ),
  );
  const lastPayment = offset + last.month;
  expect(lastPayment, "last payment number").toBeLessThanOrEqual(bound);
  const clamped = s.eventOutcomes.some((e) => e.issue !== null);
  const shortens = (loan.prepayments ?? []).some(
    (p) => p.effect === "shortenTerm",
  );
  // Nothing moved the maturity: the loan runs exactly to the contract term.
  if (recasts.length === 0 && !shortens && !clamped)
    expect(lastPayment, "contract term").toBe(contract);

  // No balloon unless the inputs ask for one.
  const prev = paying.at(-2);
  if (!prev || prev.month !== last.month - 1) return;
  const due = (p: number) => iso(edate(block.startDate, p));
  const asked =
    s.eventOutcomes.some(
      (e) =>
        e.issue === "RECAST_TERM_CAPPED" ||
        e.issue === "RECAST_INSTALMENT_BELOW_INTEREST",
    ) ||
    recasts.some((r) => {
      const q = paymentOnOrAfter(block, isoDate(r.date));
      // A maturity one or two payments away, or a recast that re-sets the payment
      // within the loan's last two (an agreed instalment that clears it, or a new
      // annuity the loan then ends on).
      return (
        lastPayment - q <= 2 ||
        ("maturity" in r && paymentsDueBy(block, isoDate(r.maturity)) - q <= 2)
      );
    }) ||
    (loan.draws ?? []).some((x) => x.date > due(lastPayment - 2));
  if (!asked)
    expect(
      paid(last).lessThanOrEqualTo(paid(prev).times(3)),
      `last payment ${paid(last).toFixed(2)} after ${paid(prev).toFixed(2)}`,
    ).toBe(true);
}

/** A loan and two baseDates in one payment period: b2 is the generated baseDate, b1
 *  an earlier day on or after the last payment due by b2. */
const shifted = fc
  .tuple(loanWithEvents, share)
  .filter(([g]) => isValid(g))
  .map(([g, x]) => {
    const { loan, base } = g;
    const block = toBlock(loan);
    const lastDue = iso(
      edate(block.startDate, paymentsDueBy(block, isoDate(base))),
    );
    const room = days(lastDue, base);
    const b1 = iso(addDays(isoDate(lastDue), Math.floor(x * room)));
    return { loan, b1, b2: base, extra: shockOf(g).extra };
  })
  .filter(({ loan, b1, b2 }) => loan.start <= b1 && b1 < b2);

describe("#130 R1-07: a baseDate shift inside a payment period", () => {
  it(
    "moves no payment, and a late event's amount only by one payment",
    () => {
      const seen: Record<Shift, number> = {
        equal: 0,
        late: 0,
        lateTerm: 0,
        skipped: 0,
      };
      fc.assert(
        fc.property(shifted, ({ loan, b1, b2, extra }) => {
          fc.pre(!hits228(loan, b2)); // #228
          seen[checkShift(loan, b1, b2, extra)]++;
        }),
        RUNS,
      );
      // Not vacuous: both kinds of case occur.
      expect(seen.equal).toBeGreaterThan(RUNS.numRuns / 4);
      expect(seen.late + seen.lateTerm).toBeGreaterThan(0);
      expect(seen.lateTerm).toBeGreaterThan(0);
    },
    TIMEOUT,
  );

  // The shapes the review found (#135): they must hold on fixed inputs too.
  it("R1-03: a late prepayment after a late tranche (#135 probe)", () => {
    const loan: RefLoan = {
      start: "2026-01-15",
      principal: 100000,
      ratePa: 0.05,
      instalment: 600,
      fixationMonths: 60,
      termMonths: 300,
      draws: [{ date: "2026-04-20", amount: 1000000 }],
      prepayments: [
        { date: "2026-04-25", amount: 300000, effect: "lowerInstalment" },
      ],
    };
    expect(checkShift(loan, "2026-04-22", "2026-04-28")).toBe("late");
    expect(checkShift(loan, "2026-04-28", "2026-05-14")).toBe("equal");
  });

  // #228 (ADR 0136): under 06-06 the late window pulls the prepayment back to the
  // payment the recast follows. It sizes the term on the agreed 1,600 Kč the next
  // payment pays, not on the 2,000 Kč before the recast (that ended in a 125,586 Kč
  // balloon). (The shift check does not compare the end here: the recast follows
  // payment o.)
  const loan228: RefLoan = {
    start: "2025-06-07",
    principal: 300000,
    ratePa: 0.045,
    instalment: 2000,
    fixationMonths: 120,
    prepayments: [{ date: "2026-06-06", amount: 3000, effect: "shortenTerm" }],
    recasts: [{ date: "2026-05-07", instalment: 1600 }],
  };
  /** The loan's last payment: its number and what it pays. */
  const lastPaid = (loan: RefLoan, base: string) => {
    const rows = run(loan, base).rows;
    const last = rows.find((r) => r.month === lastPaying(rows));
    const offset = paymentOffset(toBlock(loan), isoDate(base));
    return last ? `${offset + last.month}: ${paid(last).toFixed(2)}` : "none";
  };
  // The loan ends on the same payment under all three baseDates. Under 06-06 the
  // 3,000 Kč is repaid one payment earlier, so the last payment is a little lower.
  it("#228: a late shortenTerm prepayment after an instalment recast", () => {
    for (const [base, last] of [
      ["2026-05-07", "310: 1194.91"],
      ["2026-06-06", "310: 1160.59"],
      ["2026-06-07", "310: 1194.91"],
    ]) {
      checkEnd(loan228, base);
      expect(lastPaid(loan228, base), base).toBe(last);
    }
  });
  it("#228: the same on a development loan (222,632 Kč balloon before)", () => {
    const loan: RefLoan = {
      start: "2025-06-07",
      principal: 300000,
      ratePa: 0.005,
      instalment: 2565,
      termMonths: 120,
      fixationMonths: 120,
      draws: [{ date: "2026-04-07", amount: 15000 }],
      completion: "2026-04-07",
      prepayments: [
        { date: "2026-06-06", amount: 3000, effect: "shortenTerm" },
      ],
      recasts: [{ date: "2026-05-07", instalment: 921 }],
    };
    for (const base of ["2026-05-07", "2026-06-06"]) checkEnd(loan, base);
    expect(lastPaid(loan, "2026-05-07")).toBe("373: 1353.26");
    expect(lastPaid(loan, "2026-06-06")).toBe("373: 1353.25");
  });
  // Known limitation (ADR 0136): a maturity recast leaves no agreed instalment, only an
  // owed re-amortization, which `shortenTerm` does not see (as in ADR 0120 decision 4).
  // Under 09-06 the late prepayment sizes the term on the instalment before the recast,
  // and the loan ends 12 payments earlier than under 08-07. No balloon either way.
  it("#228: a late shortenTerm after a maturity recast (today: 12 payments earlier)", () => {
    const loan: RefLoan = {
      start: "2023-02-07",
      principal: 300000,
      ratePa: 0.005,
      instalment: 2565,
      termMonths: 120,
      fixationMonths: 12,
      draws: [
        { date: "2023-03-01", amount: 43442 },
        { date: "2025-07-01", amount: 33985 },
      ],
      completion: "2025-07-01",
      prepayments: [
        { date: "2025-09-06", amount: 3000, effect: "shortenTerm" },
      ],
      recasts: [{ date: "2025-08-07", maturity: "2034-02-07" }],
    };
    for (const base of ["2025-08-07", "2025-09-06"]) checkEnd(loan, base);
    expect(lastPaying(run(loan, "2025-08-07").rows)).toBe(102);
    expect(lastPaying(run(loan, "2025-09-06").rows)).toBe(90);
  });

  it("R1-04: a payment due just before completion (#135 probe)", () => {
    const loan: RefLoan = {
      start: "2026-01-08",
      principal: 3000000,
      ratePa: 0.05,
      instalment: 16000,
      fixationMonths: 60,
      termMonths: 360,
      completion: "2027-03-10",
    };
    for (const [b1, b2] of [
      ["2026-06-08", "2026-06-09"],
      ["2027-02-08", "2027-03-07"],
    ])
      expect(checkShift(loan, b1, b2)).toBe("equal");
  });
});

/** The R1-01 shape: a development loan with no completion date and an instalment
 *  recast after baseDate that a later tranche follows. */
const hasR101Shape = (loan: RefLoan, base: string) =>
  !loan.completion &&
  (loan.recasts ?? []).some(
    (r) =>
      "instalment" in r &&
      r.date > base &&
      (loan.draws ?? []).some((x) => x.date > r.date),
  );

describe("#130 R1-07: random loans end at the maturity in force", () => {
  it(
    "with a zero balance, no later payment and no balloon",
    () => {
      let r101 = 0;
      fc.assert(
        fc.property(loanWithEvents, (g) => {
          fc.pre(isValid(g));
          const { loan, base } = g;
          fc.pre(!hits228(loan, base)); // #228
          checkEnd(loan, base, shockOf(g).extra);
          if (hasR101Shape(loan, base)) r101++;
        }),
        RUNS,
      );
      // Not vacuous: the generator draws the R1-01 shape (~3 % of loans, #232).
      expect(r101).toBeGreaterThan(0);
    },
    TIMEOUT,
  );

  // R1-01 (#109): a tranche on the payment after an instalment recast was never
  // re-amortized, and the last payment repaid ~2.16 M Kč (ADR 0120).
  it("R1-01: a tranche after an instalment recast (#109 probe)", () => {
    const loan: RefLoan = {
      start: "2026-03-01",
      principal: 2000000,
      ratePa: 0.049,
      instalment: 11000,
      fixationMonths: 360,
      termMonths: 360,
      draws: [{ date: "2027-01-15", amount: 1000000 }],
      recasts: [{ date: "2027-01-01", instalment: 15000 }],
    };
    checkEnd(loan, "2026-06-07");
  });
});
