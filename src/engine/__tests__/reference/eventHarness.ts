// ADR 0109: shared harness for running prepayments and recasts through BOTH the engine
// and the independent reference model (TEST-ONLY).
import { buildSchedule, propertySchedule } from "../../schedule";
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
  referenceChain,
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

/**
 * Engine schedule and reference rows for one loan. Under D-41 (`openingDraws:
 * "nextPeriod"`), reference row 1's `draw` is rebased to the engine's meaning (DR-092):
 * the tranches after the last payment due and on/before baseDate leave it, because the
 * engine counts them as opening debt. Balances and every other column are untouched.
 */
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
  const options = { ...REF, baseDate: base, months: REF_MONTHS, ...opts };
  const r = referenceSchedule(l, options);
  if (options.openingDraws === "nextPeriod" && r.length > 0)
    r[0] = { ...r[0], draw: r[0].draw.minus(openingDraws(l, base).toString()) };
  return { e, r };
}

/** Engine chain (`propertySchedule`) and the reference chain for one property's
 *  loans; a single loan is a chain of one. Row 1's draw is rebased as in `both`. */
export function chainBoth(
  loans: RefLoan[],
  base = "2026-06-07",
  opts: Partial<RefOptions> = {},
  extra: Partial<Assumptions> = {},
) {
  const e = propertySchedule(
    loans.map((l, i) => toBlock(l, `b${i}`)),
    { ...A0, baseDate: isoDate(base), ...extra },
  );
  const r = referenceChain(loans, {
    ...REF,
    baseDate: base,
    months: REF_MONTHS,
    ...opts,
  });
  // Row 1's draw rebased to the engine's meaning, as in `both` (D-41, DR-092).
  const inForce = loans.filter((l) => l.start <= base).at(-1);
  if (inForce && r.rows.length > 0)
    r.rows[0] = {
      ...r.rows[0],
      draw: r.rows[0].draw.minus(openingDraws(inForce, base).toString()),
    };
  return { e, r };
}

/** A running loan's tranches after its last payment due and on/before baseDate. */
function openingDraws(l: RefLoan, base: string): Decimal {
  if (l.start > base) return D(0);
  const last = addMonths(l.start, paymentsMadeBy(l.start, base));
  return (l.draws ?? [])
    .filter((x) => x.date > last && x.date <= base)
    .reduce((s, x) => s.plus(String(x.amount)), D(0));
}

/**
 * Max |Δ| over every column; the instalment only where the reference pays. The
 * reference runs longer than the engine (`REF_MONTHS`): every reference row past the
 * engine's last one must be idle, else the engine dropped a row that still pays.
 * On a refinance handover row the engine's `refinanced` is the successor's draw less
 * what it paid off (D-47, ADR 0130), the reference's `draw` the successor's gross draw:
 * pass the reference `handovers` so the row is compared as gross − paid off. An owner
 * tranche landing on that row is in the engine's `drawn` there, and in the reference's
 * paid-off balance; the conservation checks count it.
 */
export function maxDev(
  e: AmortizationRow[],
  r: RefRow[],
  handovers: readonly { month: number; paidOff: { toString(): string } }[] = [],
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
    const h = handovers.find((x) => x.month === e[i].month);
    const draw = h ? r[i].draw.minus(h.paidOff.toString()) : r[i].draw;
    const netNew = h ? e[i].refinanced : e[i].drawn.plus(e[i].refinanced);
    m = Math.max(m, Math.abs(netNew.minus(draw.toString()).toNumber()));
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
