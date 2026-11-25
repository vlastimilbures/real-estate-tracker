// Property detail's records (#484): one property's rows, the mortgage table's development
// summary and the valuation an added one closes. Pure.
import {
  dayBefore,
  openPredecessor,
  scheduledPrincipal,
  type HoldingCost,
  type Lease,
  type MortgageBlock,
  type Portfolio,
  type Valuation,
} from "../../engine";
import type { Dictionary } from "../../i18n";
import { fmtCzk, fmtDate } from "../../lib/format";

/** One property's stored records. */
export interface PropertyRecords {
  valuations: Valuation[];
  leases: Lease[];
  mortgages: MortgageBlock[];
  holding: HoldingCost | undefined;
}

/** The property's valuations, leases and loan blocks, and its holding costs; empty while
 *  no portfolio has loaded. New arrays on every call, as the page always built them. */
export function propertyRecords(
  portfolio: Portfolio | null,
  propertyId: string | null,
): PropertyRecords {
  const mine = <R extends { propertyId: string }>(rows: R[] | undefined) =>
    (rows ?? []).filter((r) => r.propertyId === propertyId);
  return {
    valuations: mine(portfolio?.valuations),
    leases: mine(portfolio?.leases),
    mortgages: mine(portfolio?.mortgages),
    holding: portfolio?.holdingCosts.find((h) => h.propertyId === propertyId),
  };
}

/** The mortgage table's compact development-loan summary: tranches and total loan, the
 *  interest-only end; "—" for a standard loan. */
export function developmentSummary(t: Dictionary, r: MortgageBlock): string {
  const d = t.propertyDetail;
  const parts: string[] = [];
  if (r.draws?.length) {
    // Total loan = start draw + every later tranche (ADR 0167). Surfacing it lets the
    // user sanity-check the loan isn't double-counting the first draw.
    const total = scheduledPrincipal(r);
    parts.push(`${d.tranches(r.draws.length)} · ${d.totalLoan(fmtCzk(total))}`);
  }
  if (r.completionDate) parts.push(d.ioUntil(fmtDate(r.completionDate)));
  return parts.length ? parts.join(" · ") : "—";
}

/**
 * ADR 0227: an open-ended new valuation ends the open-ended one before it on the day
 * before, without asking: that one, ended. Undefined for a dated one, which changes no
 * other row (ADR 0144), and when there is none to end.
 */
export function valuationClosedBy(
  rows: Valuation[],
  v: Valuation,
): Valuation | undefined {
  const prev = v.validTo
    ? undefined
    : openPredecessor(
        rows,
        v.propertyId,
        v.validFrom,
        (r) => r.validFrom,
        (r) => r.validTo,
      );
  return prev ? { ...prev, validTo: dayBefore(v.validFrom) } : undefined;
}
