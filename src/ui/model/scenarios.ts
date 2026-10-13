// Pure presentation helpers for the Scenarios page: the implicit Base scenario and
// the one-line human summary of a scenario's deltas vs base. Extracted from
// Scenarios.tsx so they're unit-testable without mounting the component.
import { fmtPct, fmtPp, fmtSigned } from "../../lib/format";
import { D } from "../../lib/money";
import { rate, type Scenario, type ScenarioOverrides } from "../../engine";
import type { Dictionary } from "../../i18n";
import { DEFAULT_SHOCK_YEARS } from "./scenarioForm";

/** The implicit Base = the saved assumptions (no overrides, no shock). */
/** The id of the synthetic Base scenario (the saved assumptions). */
export const BASE_SCENARIO_ID = "base";

export function baseScenario(t: Dictionary): Scenario {
  return { id: BASE_SCENARIO_ID, name: t.scenarios.base, overrides: {} };
}

/** One-line human summary of a scenario's deltas vs base (for the list). `reach` is
 *  the rate shock's reach note, shown after it (ADR 0100). A shock delta comes signed
 *  (ADR 0178); the templates add no sign. */
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
        fmtSigned(o.inflationShock.deltaPa, fmtPp),
        o.inflationShock.durationYears,
      ),
    );
  if (o.rateShock) {
    const shock = sc.sumRateShock(
      fmtSigned(o.rateShock.deltaPa, fmtPp),
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

/** A saved preset: its name in the UI language and its overrides. */
export interface Preset {
  name: string;
  overrides: ScenarioOverrides;
}

/** A price crash level: its label as shown and the fall as a fraction. */
export interface CrashLevel {
  label: string;
  pct: string;
}

// Shock levels in percentage points; labels are built from them in the UI language at
// render (UX-034).
export const RATE_LEVELS_PP = [2, 4, 6];
export const INFLATION_LEVELS_PP = [3, 6, 9];
const CRASH_10: CrashLevel = { label: "−10%", pct: "0.1" };
const CRASH_20: CrashLevel = { label: "−20%", pct: "0.2" };
export const CRASH_LEVELS = [
  CRASH_10,
  CRASH_20,
  { label: "−35%", pct: "0.35" },
];
/** The crash "When" choices, in projection years (ADR 0101). */
export const CRASH_TIMINGS = [0, 5, 10];

/** A shock of `pp` points for the default shock years. */
const shock = (pp: number) => ({
  deltaPa: rate(D(pp).div(100)),
  durationYears: DEFAULT_SHOCK_YEARS,
});

/** A rate-shock preset ("+2 pp rate for 5 years"). */
export function ratePreset(pp: number, t: Dictionary): Preset {
  const sc = t.scenarios;
  return {
    name: sc.rateForYears(sc.plusPp(pp), DEFAULT_SHOCK_YEARS),
    overrides: { rateShock: shock(pp) },
  };
}

/** An inflation-shock preset. */
export function inflationPreset(pp: number, t: Dictionary): Preset {
  const sc = t.scenarios;
  return {
    name: sc.inflForYears(sc.plusPp(pp), DEFAULT_SHOCK_YEARS),
    overrides: { inflationShock: shock(pp) },
  };
}

/** The crash timing as a name suffix: none at the start (ADR 0101). */
export function crashSuffix(crashAtYear: number, t: Dictionary): string {
  return crashAtYear === 0
    ? ""
    : t.scenarios.crashAt(t.common.plusYears(crashAtYear));
}

/** A price-crash preset at the "When" timing (ADR 0101). */
export function crashPreset(
  level: CrashLevel,
  crashAtYear: number,
  t: Dictionary,
): Preset {
  return {
    name: t.scenarios.crashTitle(level.label, crashSuffix(crashAtYear, t)),
    overrides: { valueShock: { pct: rate(level.pct), atYear: crashAtYear } },
  };
}

/** A fixed combined stress recipe (ADR 0104): shock levels in pp and the crash. */
export interface CombinedRecipe {
  /** The recipe's own name ("Mild"), in the UI language. */
  level: (t: Dictionary) => string;
  ratePp: number;
  inflationPp?: number;
  crash: CrashLevel;
}

export const COMBINED_RECIPES: CombinedRecipe[] = [
  { level: (t) => t.scenarios.mild, ratePp: 2, crash: CRASH_10 },
  {
    level: (t) => t.scenarios.severe,
    ratePp: 4,
    inflationPp: 3,
    crash: CRASH_20,
  },
];

/** The saved name and overrides of a combined preset (ADR 0104). The name lists the parts
 *  in the single presets' wording, so a saved one is found by name (ADR 0093); the crash
 *  takes the "When" timing (ADR 0101). */
export function combinedPreset(
  recipe: CombinedRecipe,
  crashAtYear: number,
  t: Dictionary,
): Preset {
  const parts = [ratePreset(recipe.ratePp, t)];
  if (recipe.inflationPp !== undefined)
    parts.push(inflationPreset(recipe.inflationPp, t));
  parts.push(crashPreset(recipe.crash, crashAtYear, t));
  return {
    name: t.scenarios.combinedTitle(
      recipe.level(t),
      parts.map((p) => p.name).join(" · "),
    ),
    overrides: Object.assign({}, ...parts.map((p) => p.overrides)),
  };
}
