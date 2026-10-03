// Scenarios = assumption overrides (SPEC §7). A scenario never mutates the stored
// portfolio data; it only overrides Assumptions, then the engine is re-run. The
// time-aware shocks (temporary inflation/rate deviations, a timed value crash) ride
// through as optional `Assumptions` fields the engine reads where relevant.
import type { Assumptions, Rate, ShockBand, ValueShock } from "./types";

export interface ScenarioOverrides {
  // Permanent level overrides (apply for the whole horizon).
  appreciationPa?: Rate;
  rentIndexationPa?: Rate;
  vacancyAllowance?: Rate;
  postFixationResetRatePa?: Rate;
  inflationPa?: Rate;
  // Temporary / timed shocks (revert to trend, or land at a chosen year).
  inflationShock?: ShockBand;
  rateShock?: ShockBand;
  valueShock?: ValueShock;
}

/**
 * A named, persisted what-if. `overrides` are the assumption deltas fed through
 * `applyScenario` (including the time-aware shock descriptors). "Base" = no overrides.
 */
export interface Scenario {
  id: string;
  name: string;
  overrides: ScenarioOverrides;
  createdAt: Date;
}

/** Return a new Assumptions with the scenario's overrides applied. Pure. */
export function applyScenario(
  base: Assumptions,
  overrides: ScenarioOverrides,
): Assumptions {
  return {
    ...base,
    appreciationPa: overrides.appreciationPa ?? base.appreciationPa,
    rentIndexationPa: overrides.rentIndexationPa ?? base.rentIndexationPa,
    vacancyAllowance: overrides.vacancyAllowance ?? base.vacancyAllowance,
    postFixationResetRatePa:
      overrides.postFixationResetRatePa ?? base.postFixationResetRatePa,
    inflationPa: overrides.inflationPa ?? base.inflationPa,
    // Time-aware shocks: undefined ⇒ untouched ⇒ byte-identical to the parity targets.
    inflationShock: overrides.inflationShock ?? base.inflationShock,
    rateShock: overrides.rateShock ?? base.rateShock,
    valueShock: overrides.valueShock ?? base.valueShock,
  };
}
