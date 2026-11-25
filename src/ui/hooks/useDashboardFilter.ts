// The Dashboard's property filter (ADR 0155, 0180 §7): the saved ids pruned to the active
// properties, and the pruned filter written back to the store, so a deactivated property's
// id cannot come back with it. The page reads the result; it writes nothing itself.
import { useEffect } from "react";
import { useUiStore } from "../../state/uiStore";
import { usePortfolioStore } from "../../state/portfolioStore";
import { dashboardFilter } from "../model/dashboard";

/** The full portfolio (it drives the chips; the engine runs over `effectiveIds`), the
 *  active properties, the kept ids, whether they filter anything, and the setter. */
export function useDashboardFilter() {
  const saved = useUiStore((s) => s.dashboardPropertyIds);
  const setIds = useUiStore((s) => s.setDashboardPropertyIds);
  const portfolio = usePortfolioStore((s) => s.portfolio);
  const { pruned, ...filter } = dashboardFilter(portfolio, saved);
  useEffect(() => {
    if (pruned) setIds(pruned);
  }, [pruned, setIds]);
  return { portfolio, ...filter, setIds };
}
