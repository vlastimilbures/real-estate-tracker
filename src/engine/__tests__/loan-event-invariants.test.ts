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
// negative and ends at zero. The last payment is no balloon (R1-01 was a 1.84 M Kč one)
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
import { loanWithEvents } from "./reference/loanGen";
import { assumptions as A0 } from "./support/seed";

const RUNS = {
  seed: Number(process.env.FC_SEED ?? 20261005),
  numRuns: Number(process.env.FC_RUNS ?? 200),
};

const at = (base: string): Assumptions => ({ ...A0, baseDate: isoDate(base) });
const iso = (d: Date) => d.toISOString().slice(0, 10);
const days = (a: string, b: string) =>
  (Date.parse(b) - Date.parse(a)) / 86_400_000;
const sum = (rows: AmortizationRow[], f: (r: AmortizationRow) => Decimal) =>
  rows.reduce((s, r) => s.plus(f(r)), D(0));
const dev = (a: Decimal, b: Decimal) => a.minus(b).abs().toNumber();

function run(loan: RefLoan, base: string) {
  const block = toBlock(loan);
  const s = propertySchedule([block], at(base));
  return { ...s, opening: openingBalance(block, at(base)) };
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

type Shift = "equal" | "late" | "skipped";

/**
 * Checks one loan at baseDates b1 < b2 with the same payments due, and says which case
 * it was. `equal`: no event dated in (b1, b2] and every tranche lands in the same grid
 * month, so every row and outcome is equal. `late`: prepayments dated in (b1, b2] settle
 * after payment o+1 under b1 and after payment o under b2; they apply the same amount
 * up to what payment o+1 repaid, and the loan ends within a few payments. `skipped`: a recast in (b1, b2], a tranche landing
 * differently, or a tranche that grid month 1 counts under b1 but a late event under b2
 * does not see (ADR 0129, "What stays as it is").
 */
function checkShift(loan: RefLoan, b1: string, b2: string): Shift {
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
  // #164), nor when another prepayment also follows o (the last effect wins, §5).
  const dueO = iso(edate(block.startDate, o));
  const termComparable =
    !(loan.completion && dueO <= loan.completion) &&
    o !== loan.fixationMonths &&
    !(loan.prepayments ?? []).some(
      (p) =>
        !inWindow(p.date) && paymentOnOrAfter(block, isoDate(p.date)) === o,
    );

  const one = run(loan, b1);
  const two = run(loan, b2);
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
  // payments at most: each later term answer rounds `ceil(NPER)` on a slightly different
  // balance, and a prepayment can clear the loan one payment earlier. Never by a year.
  // A prepayment that clears the loan under one baseDate only ends it there.
  const cleared = [...one.eventOutcomes, ...two.eventOutcomes].some(
    (e) => e.issue !== null,
  );
  if (termComparable && !cleared)
    expect(
      Math.abs(lastPaying(one.rows) - lastPaying(two.rows)),
      "last payment month",
    ).toBeLessThanOrEqual(3);
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
  return "late";
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
function checkEnd(loan: RefLoan, base: string): void {
  const block = toBlock(loan);
  const s = run(loan, base);
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

  // No payment after the latest maturity anything may set.
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
    recasts.some(
      (r) =>
        "maturity" in r &&
        paymentsDueBy(block, isoDate(r.maturity)) -
          paymentOnOrAfter(block, isoDate(r.date)) <=
          2,
    ) ||
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
  .tuple(loanWithEvents, fc.double({ min: 0, max: 1, noNaN: true }))
  .map(([{ loan, base }, x]) => {
    const block = toBlock(loan);
    const lastDue = iso(
      edate(block.startDate, paymentsDueBy(block, isoDate(base))),
    );
    const room = days(lastDue, base);
    const b1 = iso(addDays(isoDate(lastDue), Math.floor(x * room)));
    return { loan, b1, b2: base };
  })
  .filter(({ loan, b1, b2 }) => loan.start <= b1 && b1 < b2);

describe("#130 R1-07: a baseDate shift inside a payment period", () => {
  it("moves no payment, and a late event's amount only by one payment", () => {
    const seen: Record<Shift, number> = { equal: 0, late: 0, skipped: 0 };
    fc.assert(
      fc.property(shifted, ({ loan, b1, b2 }) => {
        fc.pre(!hits228(loan, b2)); // #228
        seen[checkShift(loan, b1, b2)]++;
      }),
      RUNS,
    );
    // Not vacuous: both kinds of case occur.
    expect(seen.equal).toBeGreaterThan(RUNS.numRuns / 4);
    expect(seen.late).toBeGreaterThan(0);
  }, 60_000);

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

  // #228: the prepayment pulled into the late window under 06-06 sizes the term on the
  // instalment before the recast; the loan then ends in a 125,586 Kč balloon.
  it.fails(
    "#228: a late shortenTerm prepayment after an instalment recast",
    () => {
      const loan: RefLoan = {
        start: "2025-06-07",
        principal: 300000,
        ratePa: 0.045,
        instalment: 2000,
        fixationMonths: 120,
        prepayments: [
          { date: "2026-06-06", amount: 3000, effect: "shortenTerm" },
        ],
        recasts: [{ date: "2026-05-07", instalment: 1600 }],
      };
      expect(hits228(loan, "2026-06-06")).toBe(true);
      checkEnd(loan, "2026-06-06");
      checkShift(loan, "2026-05-07", "2026-06-06");
    },
  );

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

describe("#130 R1-07: random loans end at the maturity in force", () => {
  it("with a zero balance, no later payment and no balloon", () => {
    fc.assert(
      fc.property(loanWithEvents, ({ loan, base }) => {
        fc.pre(!hits228(loan, base)); // #228
        checkEnd(loan, base);
      }),
      RUNS,
    );
  }, 60_000);

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
