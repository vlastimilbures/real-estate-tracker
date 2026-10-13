// The picked as-of date as the pages compute for it (ADR 0150): resolved in the UI, since
// the state layer may not import ui/model. Dashboard and Property detail pass its date to
// the engine call and read the same date, Today flag and window for the picker and the
// subtitle; Properties resolves Today the same way without following the pick (ADR 0111).
import { useUiStore } from "../../state/uiStore";
import { usePortfolioStore } from "../../state/portfolioStore";
import { todayUtc } from "../../lib/day";
import {
  asOfBounds,
  resolveAsOf,
  type AsOfBounds,
  type ResolvedAsOf,
} from "../model/asOf";

/** The resolved as-of date and the picker's window, or null until the assumptions have
 *  loaded. `followPick: false` ignores the picked date (Today). */
export function useAsOf({ followPick = true } = {}):
  (ResolvedAsOf & { bounds: AsOfBounds }) | null {
  const picked = useUiStore((s) => s.asOf);
  const assumptions = usePortfolioStore((s) => s.assumptions);
  if (!assumptions) return null;
  const bounds = asOfBounds(assumptions.baseDate, assumptions.horizonYears);
  return {
    ...resolveAsOf(followPick ? picked : null, todayUtc(), bounds),
    bounds,
  };
}
