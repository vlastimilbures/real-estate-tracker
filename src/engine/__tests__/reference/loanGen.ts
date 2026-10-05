// ADR 0109, ADR 0116 (TEST-ONLY): random plain and development loans with random
// prepayments and recasts, at a random baseDate. Shared by the reference cross-check
// (`loanEvents.property.test.ts`) and the model-free invariants
// (`loan-event-invariants.test.ts`, #130 R1-07). Some prepayments fall just before
// baseDate, so the late window (ADR 0116 §1) is covered. Loans start on the 7th or on the
// 28th–31st, so their due dates clamp to short months and to February, leap years
// included, and those clamped dates meet events too (DR-070, #130 G2-6-11).
//
// The risky shapes too (#130 R1-08): a development loan with no completion date (a recast
// may then come before a tranche, the R1-01 shape) or one after the last tranche; up to
// three recasts of either form, off the due dates; prepayment fees; an explicit term on
// a plain loan; a rate shock at the fixation end; one successor block (a refinance).
import fc from "fast-check";
import { D, PMT } from "../../../lib/money";
import { rate } from "../../brands";
import { EngineInputError } from "../../errors";
import { assertLoanInputs } from "../../validate";
import type { Assumptions } from "../../types";
import {
  addMonths,
  firstPaymentOnOrAfter,
  termOf,
  type RefLoan,
  type RefOptions,
  type RefRecast,
} from "./mortgageReference";
import { toBlock } from "./eventHarness";

export const BASE = "2026-06-07";

/** One random loan: its baseDate, an optional rate shock and an optional successor. */
export interface RandomLoan {
  loan: RefLoan;
  base: string;
  shock?: { deltaPa: string; years: number };
  successor?: RefLoan;
}

const daysBefore = (iso: string, days: number) =>
  new Date(Date.parse(iso) - days * 86_400_000).toISOString().slice(0, 10);
const share = fc.double({ min: 0, max: 1, noNaN: true });
const opt = <T>(a: fc.Arbitrary<T>) => fc.option(a, { nil: undefined });

/** Development terms: tranches after the start; completion none, at the last tranche,
 *  or some months later. */
const devTerms = opt(
  fc.record({
    termMonths: fc.integer({ min: 120, max: 360 }),
    tranches: fc.array(
      fc.record({
        month: fc.integer({ min: 1, max: 30 }),
        day: fc.integer({ min: 1, max: 28 }),
        size: fc.double({ min: 0.05, max: 1, noNaN: true }),
      }),
      { minLength: 1, maxLength: 3 },
    ),
    completion: fc.constantFrom("none", "last", "later"),
    later: fc.integer({ min: 1, max: 6 }),
  }),
);

export const loanWithEvents: fc.Arbitrary<RandomLoan> = fc
  .record({
    bp: fc.integer({ min: 50, max: 900 }),
    principal: fc.integer({ min: 300_000, max: 8_000_000 }),
    months: fc.integer({ min: 60, max: 360 }),
    plainTerm: fc.boolean(),
    fixationYears: fc.integer({ min: 1, max: 10 }),
    startOffset: fc.integer({ min: -180, max: 24 }),
    startDay: fc.constantFrom("07", "28", "29", "30", "31"),
    prepays: fc.array(
      fc.record({
        at: share,
        size: fc.double({ min: 0.01, max: 0.7, noNaN: true }),
        shorten: fc.boolean(),
        early: fc.integer({ min: 0, max: 60 }),
        fee: opt(fc.integer({ min: 0, max: 5000 })),
      }),
      { maxLength: 3 },
    ),
    recasts: fc.array(
      fc.record({
        at: share,
        toMaturity: fc.boolean(),
        x: share,
        early: fc.integer({ min: 0, max: 27 }),
      }),
      { maxLength: 3 },
    ),
    dev: devTerms,
    baseShift: fc.integer({ min: -400, max: 400 }),
    late: opt(
      fc.record({
        days: fc.integer({ min: 0, max: 30 }),
        size: fc.double({ min: 0.01, max: 0.3, noNaN: true }),
        shorten: fc.boolean(),
      }),
    ),
    shock: opt(
      fc.record({
        deltaBp: fc.integer({ min: -200, max: 400 }),
        years: fc.integer({ min: 1, max: 5 }),
      }),
    ),
    successor: opt(
      fc.record({
        at: share,
        early: fc.integer({ min: 0, max: 27 }),
        bp: fc.integer({ min: 50, max: 900 }),
        size: fc.double({ min: 0.3, max: 1.2, noNaN: true }),
        months: fc.integer({ min: 60, max: 360 }),
        fixationYears: fc.integer({ min: 1, max: 10 }),
      }),
    ),
  })
  .map((g): RandomLoan => {
    const base = daysBefore(BASE, -g.baseShift);
    // Day `startDay` of month BASE + startOffset. addMonths clamps a missing day (31 April)
    // to the month end; step back to the month before, which always has 31 days, so the
    // start keeps its day and only the later due dates clamp.
    const month = g.startOffset + Number(BASE.slice(5, 7)) - 1;
    const at = (k: number) =>
      addMonths(`${BASE.slice(0, 4)}-01-${g.startDay}`, k);
    const start = at(month).endsWith(g.startDay) ? at(month) : at(month - 1);
    const r = D(g.bp).div(10_000);
    const instalment = PMT(r.div(12), g.months, D(-g.principal))
      .ceil()
      .toString();
    const draws = g.dev?.tranches
      .map((t) => ({
        date:
          addMonths(start, t.month).slice(0, 8) +
          String(t.day).padStart(2, "0"),
        amount: String(Math.round(t.size * g.principal)),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
    const lastDraw = draws?.at(-1)?.date;
    const completion =
      !g.dev || !lastDraw || g.dev.completion === "none"
        ? undefined
        : g.dev.completion === "last"
          ? lastDraw
          : addMonths(lastDraw, g.dev.later);
    const loan: RefLoan = {
      start,
      principal: String(g.principal),
      ratePa: r.toString(),
      instalment,
      fixationMonths: g.fixationYears * 12,
      ...(g.dev && draws
        ? {
            termMonths: g.dev.termMonths,
            draws,
            ...(completion ? { completion } : {}),
          }
        : g.plainTerm
          ? { termMonths: g.months }
          : {}),
    };
    const term = termOf(loan);
    /** A payment number from 1 to term − 1. */
    const payment = (at: number) => 1 + Math.floor(at * (term - 2));
    const effect = (shorten: boolean) =>
      shorten ? ("shortenTerm" as const) : ("lowerInstalment" as const);
    const prepayments = g.prepays.map((p) => ({
      date: daysBefore(addMonths(start, payment(p.at)), p.early),
      amount: String(Math.round(p.size * g.principal)),
      effect: effect(p.shorten),
      ...(p.fee != null ? { fee: String(p.fee) } : {}),
    }));
    // A prepayment just before baseDate: inside the loan, often in the late window.
    const lateDate = g.late ? daysBefore(base, g.late.days) : null;
    if (
      g.late &&
      lateDate &&
      lateDate > start &&
      lateDate < addMonths(start, term)
    )
      prepayments.push({
        date: lateDate,
        amount: String(Math.round(g.late.size * g.principal)),
        effect: effect(g.late.shorten),
      });
    prepayments.sort((a, b) => a.date.localeCompare(b.date));
    // With a completion date, an instalment recast must come after it and a maturity
    // must follow the payment it lands on (ADR 0116). Without one, a recast may come
    // before a tranche (ADR 0116 §2, the R1-01 shape).
    const completed = completion ? firstPaymentOnOrAfter(start, completion) : 0;
    const recasts = g.recasts
      .map((c): RefRecast => {
        const k = Math.max(payment(c.at), completion ? completed + 1 : 1);
        const date = daysBefore(addMonths(start, k), c.early);
        const lo = Math.max(k, completed) + 1;
        return c.toMaturity
          ? {
              date,
              maturity: addMonths(start, lo + Math.floor(c.x * (599 - lo))),
            }
          : {
              date,
              instalment: String(Math.round((0.4 + c.x) * Number(instalment))),
            };
      })
      .sort((a, b) => a.date.localeCompare(b.date));
    // At least a grid month after the start: a future loan and its successor never
    // draw in one grid month (not modelled, as two successors there: #223). At most 20
    // years after it, so the successor ends inside the reference's 720 rows.
    const s = g.successor;
    const successor: RefLoan | undefined = s && {
      start: daysBefore(
        addMonths(start, Math.max(2, Math.min(payment(s.at), 240))),
        s.early,
      ),
      principal: String(Math.round(s.size * g.principal)),
      ratePa: D(s.bp).div(10_000).toString(),
      instalment: PMT(D(s.bp).div(120_000), s.months, D(-g.principal * s.size))
        .ceil()
        .toString(),
      fixationMonths: s.fixationYears * 12,
    };
    return {
      loan: {
        ...loan,
        prepayments,
        ...(recasts.length > 0 ? { recasts } : {}),
      },
      base,
      ...(g.shock
        ? {
            shock: {
              deltaPa: D(g.shock.deltaBp).div(10_000).toString(),
              years: g.shock.years,
            },
          }
        : {}),
      ...(successor ? { successor } : {}),
    };
  });

/** The engine accepts every block of the loan (the generator aims for valid inputs; a
 *  rare invalid combination is skipped with `fc.pre`). */
export function isValid(g: RandomLoan): boolean {
  try {
    for (const l of [g.loan, ...(g.successor ? [g.successor] : [])])
      assertLoanInputs(toBlock(l));
    return true;
  } catch (e) {
    if (e instanceof EngineInputError) return false;
    throw e;
  }
}

/** The rate shock as reference options and engine assumptions (at each fixation end). */
export function shockOf(g: RandomLoan): {
  opts: Partial<RefOptions>;
  extra: Partial<Assumptions>;
} {
  if (!g.shock) return { opts: {}, extra: {} };
  const { deltaPa, years } = g.shock;
  return {
    opts: { rateShock: { deltaPa, months: years * 12, anchor: "fixationEnd" } },
    extra: { rateShock: { deltaPa: rate(deltaPa), durationYears: years } },
  };
}
