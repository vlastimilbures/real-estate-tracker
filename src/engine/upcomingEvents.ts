// Upcoming events (ADR 0103): fixation ends, modelled payoffs, development completions and
// lease ends without a follow-on lease, read off the financing exposure.
import { firstAfter } from "./dates";
import { inWindow, type FinancingExposure } from "./financing";
import { isDevLoan } from "./loanBlock";
import { chainLinks, replacedOnOrBefore } from "./schedule";
import { activeProperties, leaseInForce } from "./selectors";
import type { IsoDate, Lease, Portfolio } from "./types";
import type { Decimal } from "../lib/money";

export type FinancingEventKind =
  "fixationEnd" | "loanPayoff" | "devCompletion" | "leaseEnd";

export interface FinancingEvent {
  date: IsoDate;
  kind: FinancingEventKind;
  propertyId: string;
  /** The balance at a fixation end. */
  amount?: Decimal;
}

const KIND_ORDER: FinancingEventKind[] = [
  "fixationEnd",
  "loanPayoff",
  "devCompletion",
  "leaseEnd",
];

/** A development block's completion, unless a successor replaces it first. */
function completions(
  portfolio: Portfolio,
  fx: FinancingExposure,
): FinancingEvent[] {
  const events: FinancingEvent[] = [];
  for (const loan of fx.loans) {
    const blocks = portfolio.mortgages.filter(
      (b) => b.propertyId === loan.propertyId,
    );
    for (const link of chainLinks(blocks, fx.asOf)) {
      const b = link.block;
      const done = isDevLoan(b) ? b.completionDate : undefined;
      if (!done || replacedOnOrBefore(link, done)) continue;
      events.push({
        date: done,
        kind: "devCompletion",
        propertyId: b.propertyId,
      });
    }
  }
  return events;
}

/**
 * The end of the lease in force at `asOf`, or null when that lease is open-ended, a later
 * lease is entered, or none is in force. `leases` = one property's leases. Shared by the
 * upcoming lease ends and the data check (ADR 0118).
 */
export function leaseEndWithoutFollowOn(
  leases: Lease[],
  asOf: Date,
): IsoDate | null {
  const lease = leaseInForce(leases, asOf);
  if (!lease?.endDate) return null;
  if (firstAfter(leases, lease.startDate, (l) => l.startDate)) return null;
  return lease.endDate;
}

/** The in-force lease's end for each active property, when no later lease is entered. */
function leaseEnds(portfolio: Portfolio, asOf: Date): FinancingEvent[] {
  const events: FinancingEvent[] = [];
  const active = activeProperties(portfolio.properties);
  for (const id of new Set(active.map((p) => p.id))) {
    const leases = portfolio.leases.filter((l) => l.propertyId === id);
    const date = leaseEndWithoutFollowOn(leases, asOf);
    if (date) events.push({ date, kind: "leaseEnd", propertyId: id });
  }
  return events;
}

/**
 * Fixation ends (with the balance), modelled payoffs, development completions and lease
 * ends without a follow-on lease, in (as-of, as-of + `months`], sorted by date, then
 * kind (ADR 0103), then the portfolio's property order (by name, ADR 0127): random ids
 * never decide (ADR 0176).
 */
export function upcomingEvents(
  portfolio: Portfolio,
  fx: FinancingExposure,
  months: number,
): FinancingEvent[] {
  const n = portfolio.properties.length;
  const order = new Map(portfolio.properties.map((p, i) => [p.id, i]));
  const resets: FinancingEvent[] = fx.resets
    .filter((r) => r.status === "upcoming")
    .map((r) => ({
      date: r.fixationEnd,
      kind: "fixationEnd",
      propertyId: r.propertyId,
      amount: r.balance,
    }));
  const payoffs: FinancingEvent[] = fx.loans.flatMap((l) =>
    l.payoffDate
      ? [
          {
            date: l.payoffDate,
            kind: "loanPayoff" as const,
            propertyId: l.propertyId,
          },
        ]
      : [],
  );
  return [
    ...resets,
    ...payoffs,
    ...completions(portfolio, fx),
    ...leaseEnds(portfolio, fx.asOf),
  ]
    .filter((e) => inWindow(e.date, fx.asOf, months))
    .sort(
      (a, b) =>
        a.date.getTime() - b.date.getTime() ||
        KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
        (order.get(a.propertyId) ?? n) - (order.get(b.propertyId) ?? n),
    );
}
