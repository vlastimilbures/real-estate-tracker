// Property detail's records: one property's rows and the mortgage table's development
// summary. Pure.
import {
  scheduledPrincipal,
  type HoldingCost,
  type Lease,
  type MortgageBlock,
  type Portfolio,
  type Valuation,
} from "../../engine";
import type { Dictionary } from "../../i18n";
import { fmtCzk, fmtDate, EMPTY } from "../../lib/format";

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
  return parts.length ? parts.join(" · ") : EMPTY;
}
