// The Dashboard "Financing & upcoming" panel (ADR 0103, #31). Pure shaping of the engine's
// financing exposure: the next reset across the portfolio, debt resetting in the chosen
// window, total interest of the lens, interest saved by prepayments (ADR 0116) and the
// fixation timeline of the window (ADR 0204). Balances and interest saved stay nominal in
// the real lens (labelled so); total interest follows the lens.
import {
  addYears,
  debtResettingWithin,
  monthsBetween,
  upcomingEvents,
  utc,
} from "../../engine";
import type {
  FinancingEventKind,
  FinancingExposure,
  Portfolio,
  PortfolioKPIs,
} from "../../engine";
import type { Dictionary } from "../../i18n";
import { ZERO, type Decimal } from "../../lib/money";
import { fmtDate } from "../../lib/format";
import type { Mode } from "./lens";
import { lensKpis } from "./lensKpis";
import { remainingTermText } from "./termText";

/** An interest-saved figure as shown (ADR 0130): a positive amount, or "n/a" in place
 *  of a negative one (a recast that applies only with the prepayment). */
export type InterestSavedShown = Decimal | "n/a";

/** The one display rule for interest saved, on the property page and the Dashboard:
 *  null and zero stay hidden, a negative figure becomes "n/a" (ADR 0130). Zero is a
 *  prepayment at a refix: the successor's typed principal already holds it. */
export function interestSavedShown(
  saved: Decimal | null,
): InterestSavedShown | null {
  if (saved === null || saved.isZero()) return null;
  return saved.lessThan(ZERO) ? "n/a" : saved;
}

/** The reset windows the panel offers, in years (ADR 0103). */
export const RESET_WINDOWS = ["1", "3", "5"] as const;
export type ResetWindow = (typeof RESET_WINDOWS)[number];
export const DEFAULT_RESET_WINDOW: ResetWindow = "3";

export interface FinancingPanelModel {
  hasLoans: boolean;
  nextReset: {
    date: string;
    propertyId: string;
    propertyName: string;
    balance: Decimal;
  } | null;
  resetting: { amount: Decimal; loans: number };
  totalInterest: Decimal;
  /** Null when no property has a figure; properties largest first, "n/a" last. The
   *  total sums the amounts shown; "n/a" when there is none (ADR 0130). */
  interestSaved: {
    total: InterestSavedShown;
    properties: {
      propertyId: string;
      propertyName: string;
      amount: InterestSavedShown;
    }[];
  } | null;
}

function eventLabel(t: Dictionary, kind: FinancingEventKind): string {
  const d = t.dashboard;
  switch (kind) {
    case "fixationEnd":
      return d.financingEventFixationEnd;
    case "loanPayoff":
      return d.financingEventLoanPayoff;
    case "devCompletion":
      return d.financingEventDevCompletion;
    case "leaseEnd":
      return d.financingEventLeaseEnd;
  }
}

/** Largest amount first, "n/a" last. */
function byAmount(a: InterestSavedShown, b: InterestSavedShown): number {
  if (a === "n/a" || b === "n/a")
    return Number(a === "n/a") - Number(b === "n/a");
  return b.comparedTo(a);
}

/** The panel's figures and rows for the exposure at its as-of date. */
export function financingPanel(
  fx: FinancingExposure,
  portfolio: Portfolio,
  kpis: PortfolioKPIs,
  mode: Mode,
  span: ResetWindow,
): FinancingPanelModel {
  const names = new Map(portfolio.properties.map((p) => [p.id, p.name]));
  const name = (id: string) => names.get(id) ?? id;
  const next = fx.resets
    .filter((r) => r.status === "upcoming")
    .sort((a, b) => a.fixationEnd.getTime() - b.fixationEnd.getTime())[0];
  const saved = fx.loans
    .flatMap((l) => {
      const amount = interestSavedShown(l.interestSaved);
      return amount === null
        ? []
        : [
            {
              propertyId: l.propertyId,
              propertyName: name(l.propertyId),
              amount,
            },
          ];
    })
    .sort((a, b) => byAmount(a.amount, b.amount));
  const amounts = saved.flatMap((r) => (r.amount === "n/a" ? [] : [r.amount]));
  return {
    hasLoans: fx.loans.length > 0,
    nextReset: next
      ? {
          date: fmtDate(next.fixationEnd),
          propertyId: next.propertyId,
          propertyName: name(next.propertyId),
          balance: next.balance,
        }
      : null,
    resetting: debtResettingWithin(fx, Number(span)),
    totalInterest: lensKpis(kpis, mode).totalInterest,
    interestSaved:
      saved.length > 0
        ? {
            total:
              amounts.length > 0
                ? amounts.reduce((sum, a) => sum.plus(a), ZERO)
                : "n/a",
            properties: saved,
          }
        : null,
  };
}

/** Rows the timeline shows before "Show all" (ADR 0204 §6). */
export const TIMELINE_ROWS = 8;

/** One date on the timeline: a fixation end or another date of the window (ADR 0204). */
export interface TimelineMark {
  kind: FinancingEventKind;
  label: string;
  date: string;
  /** "in 2 yrs 7 months", from the as-of date. */
  timeLeft: string;
  /** The debt at a fixation end, nominal; null for the other kinds. */
  amount: Decimal | null;
  /** Place on the axis, 0 (as-of) … 1 (the window's end). */
  at: number;
}

export interface TimelineRow {
  propertyId: string;
  propertyName: string;
  hasLoan: boolean;
  /** The loan's next fixation end; `beyond` when after the window (the bar runs off
   *  the edge, at = 1). Null without a loan or with no fixation end ahead. */
  fixation: (TimelineMark & { beyond: boolean; next: boolean }) | null;
  /** The property's other dates in the window, by date. */
  marks: TimelineMark[];
}

export interface FinancingTimeline {
  rows: TimelineRow[];
  /** Each 1 January in the window. */
  ticks: { label: string; at: number }[];
  /** The kinds drawn, for the legend, in the engine's kind order. */
  kinds: { kind: FinancingEventKind; label: string }[];
}

const KINDS: FinancingEventKind[] = [
  "fixationEnd",
  "loanPayoff",
  "devCompletion",
  "leaseEnd",
];

/** Time from the as-of date to `date`, as the remaining-term text (ADR 0117). */
function timeLeft(t: Dictionary, asOf: Date, date: Date): string {
  const months = monthsBetween(asOf, date);
  return months < 1
    ? t.dashboard.financingInUnderMonth
    : t.dashboard.financingIn(remainingTermText(months, t.propertyDetail));
}

/**
 * The fixation timeline of the window (ADR 0204): one row per loan, earliest upcoming
 * fixation end first, then the loans with none ahead, then the properties with a date in
 * the window but no loan; ties in the portfolio's property order (ADR 0176). The other
 * dates of the window (`upcomingEvents`) are marks on their property's row.
 */
export function financingTimeline(
  fx: FinancingExposure,
  portfolio: Portfolio,
  span: ResetWindow,
  t: Dictionary,
): FinancingTimeline {
  const asOf = fx.asOf;
  const end = addYears(asOf, Number(span));
  const width = end.getTime() - asOf.getTime();
  const at = (date: Date) =>
    Math.min(1, Math.max(0, (date.getTime() - asOf.getTime()) / width));
  const n = portfolio.properties.length;
  const order = new Map(portfolio.properties.map((p, i) => [p.id, i]));
  const names = new Map(portfolio.properties.map((p) => [p.id, p.name]));
  const mark = (
    kind: FinancingEventKind,
    date: Date,
    amount: Decimal | null,
  ): TimelineMark => ({
    kind,
    label: eventLabel(t, kind),
    date: fmtDate(date),
    timeLeft: timeLeft(t, asOf, date),
    amount,
    at: at(date),
  });
  const events = upcomingEvents(portfolio, fx, Number(span) * 12);
  const loanRows = fx.loans.map((l) => {
    const f = l.nextFixation;
    return {
      id: l.propertyId,
      first: f?.fixationEnd.getTime() ?? Infinity,
      fixation: f
        ? {
            ...mark("fixationEnd", f.fixationEnd, f.balance),
            beyond: f.fixationEnd.getTime() > end.getTime(),
            next: false,
          }
        : null,
      skip: f,
    };
  });
  const withLoan = new Set(loanRows.map((r) => r.id));
  const others = [
    ...new Set(
      events.map((e) => e.propertyId).filter((id) => !withLoan.has(id)),
    ),
  ];
  const byOrder = (a: string, b: string) =>
    (order.get(a) ?? n) - (order.get(b) ?? n);
  const sortedLoans = loanRows.sort(
    (a, b) => a.first - b.first || byOrder(a.id, b.id),
  );
  const rows: TimelineRow[] = [
    ...sortedLoans.map((r) => ({ ...r, hasLoan: true })),
    ...others.map((id) => ({
      id,
      fixation: null,
      skip: null,
      hasLoan: false,
    })),
  ].map((r) => ({
    propertyId: r.id,
    propertyName: names.get(r.id) ?? r.id,
    hasLoan: r.hasLoan,
    fixation: r.fixation,
    marks: events
      .filter(
        (e) =>
          e.propertyId === r.id &&
          !(
            e.kind === "fixationEnd" &&
            r.skip &&
            e.date.getTime() === r.skip.fixationEnd.getTime()
          ),
      )
      .map((e) => mark(e.kind, e.date, e.amount ?? null)),
  }));
  const first = rows[0]?.fixation;
  if (first) first.next = true;
  const ticks: FinancingTimeline["ticks"] = [];
  for (let y = asOf.getUTCFullYear() + 1; ; y++) {
    const jan = utc(y, 1, 1);
    if (jan.getTime() > end.getTime()) break;
    ticks.push({ label: String(y), at: at(jan) });
  }
  const drawn = new Set(
    rows.flatMap((r) => [
      ...(r.fixation ? [r.fixation.kind] : []),
      ...r.marks.map((m) => m.kind),
    ]),
  );
  return {
    rows,
    ticks,
    kinds: KINDS.filter((k) => drawn.has(k)).map((kind) => ({
      kind,
      label: eventLabel(t, kind),
    })),
  };
}

/** The timeline as table rows (ADR 0204 §5): each row's fixation end, then its marks. */
export function timelineTable(tl: FinancingTimeline) {
  return tl.rows.flatMap((r) =>
    [...(r.fixation ? [r.fixation] : []), ...r.marks].map((m) => ({
      propertyId: r.propertyId,
      propertyName: r.propertyName,
      event: m.label,
      date: m.date,
      timeLeft: m.timeLeft,
      amount: m.amount,
    })),
  );
}

/** Row labels of the lens: balances are nominal, so the real lens says so (ADR 0087). */
export function financingLabels(
  t: Dictionary,
  mode: Mode,
  span: ResetWindow,
  horizonYears: number,
) {
  const d = t.dashboard;
  const real = mode === "real";
  const n = Number(span);
  return {
    balanceAtReset: real
      ? d.financingBalanceAtResetNominal
      : d.financingBalanceAtReset,
    resettingWithin: real
      ? d.financingResettingWithinNominal(n)
      : d.financingResettingWithin(n),
    totalInterest: real
      ? d.financingTotalInterestReal(horizonYears)
      : d.financingTotalInterest(horizonYears),
  };
}
