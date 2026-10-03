// Pure presentation helpers for the Scenarios page: the implicit Base scenario and
// the one-line human summary of a scenario's deltas vs base. Extracted from
// Scenarios.tsx so they're unit-testable without mounting the component.
import { fmtPct, fmtPp } from "../../lib/format";
import {
  rate,
  type Assumptions,
  type Scenario,
  type ScenarioOverrides,
} from "../../engine";
import type { Dictionary } from "../../i18n";
import { DEFAULT_SHOCK_YEARS } from "./scenarioForm";

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

/** One-line human summary of a scenario's deltas vs base (for the list). `reach` is
 *  the rate shock's reach note, shown after it (ADR 0100). */
export function summarize(s: Scenario, t: Dictionary, reach?: string): string {
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
  if (o.rateShock) {
    const shock = sc.sumRateShock(
      fmtPp(o.rateShock.deltaPa),
      o.rateShock.durationYears,
    );
    parts.push(reach ? `${shock}, ${reach}` : shock);
  }
  if (o.valueShock)
    parts.push(sc.sumValueShock(fmtPct(o.valueShock.pct), o.valueShock.atYear));
  return parts.length ? parts.join(" · ") : sc.noOverrides;
}

/** The saved scenario with exactly this name, if any: a preset that is already saved
 *  creates no second row (ADR 0093). */
export function findByName(
  scenarios: Scenario[],
  name: string,
): Scenario | undefined {
  return scenarios.find((s) => s.name === name);
}

/** A fixed combined stress recipe (ADR 0104): shock levels in pp with their decimal
 *  deltas, and the crash as its label and fraction. */
export interface CombinedRecipe {
  /** The recipe's own name ("Mild"), in the UI language. */
  level: (t: Dictionary) => string;
  rate: { pp: number; delta: string };
  inflation?: { pp: number; delta: string };
  crash: { label: string; pct: string };
}

/** The saved name and overrides of a combined preset (ADR 0104). The name lists the parts
 *  in the single presets' wording, so a saved one is found by name (ADR 0093); the crash
 *  takes the "When" timing (ADR 0101). */
export function combinedPreset(
  recipe: CombinedRecipe,
  crashAtYear: number,
  t: Dictionary,
): { name: string; overrides: ScenarioOverrides } {
  const sc = t.scenarios;
  const suffix =
    crashAtYear === 0 ? "" : sc.crashAt(t.common.plusYears(crashAtYear));
  const parts = [
    sc.rateForYears(sc.plusPp(recipe.rate.pp), DEFAULT_SHOCK_YEARS),
  ];
  if (recipe.inflation)
    parts.push(
      sc.inflForYears(sc.plusPp(recipe.inflation.pp), DEFAULT_SHOCK_YEARS),
    );
  parts.push(sc.crashTitle(recipe.crash.label, suffix));
  return {
    name: sc.combinedTitle(recipe.level(t), parts.join(" · ")),
    overrides: {
      rateShock: {
        deltaPa: rate(recipe.rate.delta),
        durationYears: DEFAULT_SHOCK_YEARS,
      },
      ...(recipe.inflation && {
        inflationShock: {
          deltaPa: rate(recipe.inflation.delta),
          durationYears: DEFAULT_SHOCK_YEARS,
        },
      }),
      valueShock: { pct: rate(recipe.crash.pct), atYear: crashAtYear },
    },
  };
}
