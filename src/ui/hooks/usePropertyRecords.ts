// One property's stored records, for Property detail (#484). Built on every render, as the
// page did, so the panels get the same arrays they always got.
import { usePortfolioStore } from "../../state/portfolioStore";

/** The property's valuations, leases and loan blocks, and its holding costs. Empty while
 *  no portfolio has loaded. */
export function usePropertyRecords(propertyId: string | null) {
  const portfolio = usePortfolioStore((s) => s.portfolio);
  const mine = <R extends { propertyId: string }>(rows: R[] | undefined) =>
    (rows ?? []).filter((r) => r.propertyId === propertyId);
  return {
    valuations: mine(portfolio?.valuations),
    leases: mine(portfolio?.leases),
    mortgages: mine(portfolio?.mortgages),
    holding: portfolio?.holdingCosts.find((h) => h.propertyId === propertyId),
  };
}
