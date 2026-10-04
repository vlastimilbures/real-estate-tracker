// ADR 0109: shared harness for running prepayments and recasts through BOTH the engine
// and the independent reference model (TEST-ONLY).
import { buildSchedule } from "../../schedule";
import { isoDate } from "../../dates";
import { D, type Decimal } from "../../../lib/money";
import { money, rate } from "../../brands";
import type {
  AmortizationRow,
  Assumptions,
  LoanRecast,
  MortgageBlock,
} from "../../types";
import { assumptions as A0 } from "../support/seed";
import {
  addMonths,
  paymentsMadeBy,
  referenceSchedule,
  type RefLoan,
  type RefOptions,
  type RefRow,
} from "./mortgageReference";
import { RESET } from "./seedLoans";

export const TIGHT = 1e-6; // Kč
/** The reference always runs this long, so a row the engine trims or misses shows. */
export const REF_MONTHS = 720;

export function toBlock(l: RefLoan, id = "x", propertyId = "p"): MortgageBlock {
  return {
    id,
    propertyId,
    startDate: isoDate(l.start),
    initialPrincipal: money(String(l.principal)),
    fixationYears: l.fixationMonths / 12,
    interestRatePa: rate(String(l.ratePa)),
    monthlyInstalment: money(String(l.instalment)),
    loanTermYears: l.termMonths != null ? l.termMonths / 12 : undefined,
    draws: l.draws?.map((x) => ({
      date: isoDate(x.date),
      amount: money(String(x.amount)),
    })),
    completionDate: l.completion ? isoDate(l.completion) : undefined,
    prepayments: l.prepayments?.map((p) => ({
      date: isoDate(p.date),
      amount: money(String(p.amount)),
      effect: p.effect,
      fee: p.fee != null ? money(String(p.fee)) : undefined,
    })),
    recasts: l.recasts?.map((r): LoanRecast =>
      "maturity" in r
        ? { date: isoDate(r.date), maturity: isoDate(r.maturity) }
        : { date: isoDate(r.date), instalment: money(String(r.instalment)) },
    ),
  } as MortgageBlock;
}

export const REF: Omit<RefOptions, "baseDate" | "months"> = {
  resetRatePa: RESET,
  calendar: "gridDueDate",
  devInstalment: "fromTerm", // D-31
  openingDraws: "nextPeriod", // D-41
};

export function both(
  l: RefLoan,
  base = "2026-06-07",
  opts: Partial<RefOptions> = {},
  extra: Partial<Assumptions> = {},
): { e: AmortizationRow[]; r: RefRow[] } {
  const e = buildSchedule(toBlock(l), {
    ...A0,
    baseDate: isoDate(base),
    ...extra,
  });
  const r = referenceSchedule(l, {
    ...REF,
    baseDate: base,
    months: REF_MONTHS,
    ...opts,
  });
  // D-41: the engine counts these tranches as opening debt, not as row 1's `drawn`.
  const carried = openingDraws(l, base);
  if (r.length > 0 && !carried.isZero())
    r[0] = { ...r[0], draw: r[0].draw.minus(carried.toString()) };
  return { e, r };
}

/**
 * A running loan's tranches after its last payment due and on/before baseDate (D-41).
 * The reference carries them into grid row 1's `draw`; the engine counts them as
 * opening debt (`AmortizationRow.drawn` is debt dated after baseDate).
 */
function openingDraws(l: RefLoan, base: string): Decimal {
  if (l.start > base) return D(0);
  const n = paymentsMadeBy(l.start, base);
  const last = n > 0 ? addMonths(l.start, n) : l.start;
  return (l.draws ?? [])
    .filter((x) => x.date > last && x.date <= base)
    .reduce((s, x) => s.plus(String(x.amount)), D(0));
}

/**
 * Max |Δ| over every column; the instalment only where the reference pays. The
 * reference runs longer than the engine (`REF_MONTHS`): every reference row past the
 * engine's last one must be idle, else the engine dropped a row that still pays.
 * `drawn` is skipped on a refinance handover row: the engine shows the net new debt
 * there, the reference the successor's gross draw (D-47; #172 may change that row).
 * Callers compare the handover's drawn and paid-off amounts on the `Refinance` records.
 */
export function maxDev(
  e: AmortizationRow[],
  r: RefRow[],
  handovers: readonly { month: number }[] = [],
): number {
  if (r.length < e.length) return Infinity;
  let m = 0;
  for (const row of r.slice(e.length)) {
    for (const v of [row.payment, row.prepaid, row.draw, row.endBalance])
      m = Math.max(m, Math.abs(v.toNumber()));
  }
  const cols = [
    "ratePa",
    "interest",
    "principal",
    "prepaid",
    "endBalance",
  ] as const;
  for (let i = 0; i < e.length; i++) {
    for (const c of cols) {
      m = Math.max(m, Math.abs(e[i][c].minus(r[i][c].toString()).toNumber()));
    }
    m = Math.max(
      m,
      Math.abs(e[i].prepaymentFee.minus(r[i].fee.toString()).toNumber()),
    );
    if (!handovers.some((h) => h.month === e[i].month)) {
      m = Math.max(
        m,
        Math.abs(e[i].drawn.minus(r[i].draw.toString()).toNumber()),
      );
    }
    if (r[i].payment.greaterThan(0)) {
      m = Math.max(
        m,
        Math.abs(e[i].instalment.minus(r[i].instalment.toString()).toNumber()),
      );
    }
  }
  return m;
}

export const sum = (
  rows: AmortizationRow[],
  f: (r: AmortizationRow) => Decimal,
): Decimal => rows.reduce((s, r) => s.plus(f(r)), D(0));
