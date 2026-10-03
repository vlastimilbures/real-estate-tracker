// Pure presentation helpers for the Scenarios page: the implicit Base scenario and
// the one-line human summary of a scenario's deltas vs base. Extracted from
// Scenarios.tsx so they're unit-testable without mounting the component.
import { fmtPct, fmtPp } from "../../lib/format";
import type { Assumptions, Scenario } from "../../engine";
import type { Dictionary } from "../../i18n";

/** The implicit Base = the saved assumptions (no overrides, no shock). */
/** The id of the synthetic Base scenario (the saved assumptions). */
export const BASE_SCENARIO_ID = "base";

export function baseScenario(a: Assumptions, t: Dictionary): Scenario {
  return {
    id: BASE_SCENARIO_ID,
    name: t.scenarios.base,
    overrides: {},
    createdAt: a.baseDate,
  };
}

/** One-line human summary of a scenario's deltas vs base (for the list). */
export function summarize(s: Scenario, t: Dictionary): string {
  const parts: string[] = [];
  const o = s.overrides;
  const sc = t.scenarios;
  if (o.appreciationPa)
    parts.push(sc.sumAppreciation(fmtPct(o.appreciationPa)));
  if (o.rentIndexationPa)
    parts.push(sc.sumRentIndex(fmtPct(o.rentIndexationPa)));
  if (o.vacancyAllowance) parts.push(sc.sumVacancy(fmtPct(o.vacancyAllowance)));
  if (o.postFixationResetRatePa)
    parts.push(sc.sumResetRate(fmtPct(o.postFixationResetRatePa)));
  if (o.inflationPa) parts.push(sc.sumInflation(fmtPct(o.inflationPa)));
  if (o.inflationShock)
    parts.push(
      sc.sumInflationShock(
        fmtPp(o.inflationShock.deltaPa),
        o.inflationShock.durationYears,
      ),
    );
  if (o.rateShock)
    parts.push(
      sc.sumRateShock(fmtPp(o.rateShock.deltaPa), o.rateShock.durationYears),
    );
  if (o.valueShock)
    parts.push(sc.sumValueShock(fmtPct(o.valueShock.pct), o.valueShock.atYear));
  return parts.length ? parts.join(" · ") : sc.noOverrides;
}
