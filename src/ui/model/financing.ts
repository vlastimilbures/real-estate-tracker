// The Dashboard "Financing & upcoming" panel (ADR 0103, #31). Pure shaping of the engine's
// financing exposure: the next reset across the portfolio, debt resetting in the chosen
// window, total interest of the lens and the next 12 months' events. Balances stay
// nominal in the real lens (labelled so); total interest follows the lens.
import { debtResettingWithin, upcomingEvents } from "../../engine";
import type {
  FinancingEventKind,
  FinancingExposure,
  Portfolio,
  PortfolioKPIs,
} from "../../engine";
import type { Dictionary } from "../../i18n";
import type { Decimal } from "../../lib/money";
import { fmtDate } from "../../lib/format";
import type { Mode } from "./lens";

/** The reset windows the panel offers, in years (ADR 0103). */
export const RESET_WINDOWS = ["1", "3", "5"] as const;
export type ResetWindow = (typeof RESET_WINDOWS)[number];
export const DEFAULT_RESET_WINDOW: ResetWindow = "3";

/** Months of upcoming events, and how many the panel lists. */
const EVENT_MONTHS = 12;
const MAX_EVENTS = 5;

export interface FinancingEventRow {
  date: string;
  propertyId: string;
  propertyName: string;
  label: string;
  amount: Decimal | null;
}

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
  events: FinancingEventRow[];
  moreEvents: number;
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

/** The panel's figures and rows for the exposure at its as-of date. */
export function financingPanel(
  fx: FinancingExposure,
  portfolio: Portfolio,
  kpis: PortfolioKPIs,
  mode: Mode,
  span: ResetWindow,
  t: Dictionary,
): FinancingPanelModel {
  const names = new Map(portfolio.properties.map((p) => [p.id, p.name]));
  const name = (id: string) => names.get(id) ?? id;
  const next = fx.resets
    .filter((r) => r.status === "upcoming")
    .sort((a, b) => a.fixationEnd.getTime() - b.fixationEnd.getTime())[0];
  const events = upcomingEvents(portfolio, fx, EVENT_MONTHS);
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
    totalInterest:
      mode === "real" ? kpis.totalInterestReal : kpis.totalInterest,
    events: events.slice(0, MAX_EVENTS).map((e) => ({
      date: fmtDate(e.date),
      propertyId: e.propertyId,
      propertyName: name(e.propertyId),
      label: eventLabel(t, e.kind),
      amount: e.amount ?? null,
    })),
    moreEvents: Math.max(0, events.length - MAX_EVENTS),
  };
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
