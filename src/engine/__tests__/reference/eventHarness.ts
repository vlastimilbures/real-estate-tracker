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
  return { e, r };
}

/**
 * Max |Δ| over every column; the instalment only where the reference pays. The
 * reference runs longer than the engine (`REF_MONTHS`): every reference row past the
 * engine's last one must be idle, else the engine dropped a row that still pays.
 */
export function maxDev(e: AmortizationRow[], r: RefRow[]): number {
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
