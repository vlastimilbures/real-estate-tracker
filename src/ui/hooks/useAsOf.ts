// The picked as-of date as the pages compute for it (ADR 0150): resolved in the UI, since
// the state layer may not import ui/model. Dashboard and Property detail pass its date to
// the engine call and read the same date and Today flag for the picker and the subtitle.
import { useUiStore } from "../../state/uiStore";
import { usePortfolioStore } from "../../state/portfolioStore";
import { todayUtc } from "../../lib/day";
import { asOfBounds, resolveAsOf, type ResolvedAsOf } from "../model/asOf";

/** The resolved as-of date, or null until the assumptions have loaded. */
export function useAsOf(): ResolvedAsOf | null {
  const picked = useUiStore((s) => s.asOf);
  const assumptions = usePortfolioStore((s) => s.assumptions);
  if (!assumptions) return null;
  return resolveAsOf(
    picked,
    todayUtc(),
    asOfBounds(assumptions.baseDate, assumptions.horizonYears),
  );
}
