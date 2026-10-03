// Pure draft-parsing for the scenario create/edit form. Kept out of ScenarioForm.tsx
// so it's unit-testable without mounting the component (mirrors ./mortgageForm.ts).
import { parsePercentToRatio, parseIntField } from "./formParse";
import type { ScenarioOverrides, ShockBand } from "../../engine";
import type { Dictionary } from "../../i18n";

// A temporary shock reverts to trend after this many years (shared with the preset bar).
export const DEFAULT_SHOCK_YEARS = 3;

// The five permanent level overrides (Decimal-valued keys of ScenarioOverrides).
export type LevelKey =
  | "appreciationPa"
  | "rentIndexationPa"
  | "vacancyAllowance"
  | "postFixationResetRatePa"
  | "inflationPa";

export const OVERRIDE_KEYS: LevelKey[] = [
  "appreciationPa",
  "rentIndexationPa",
  "vacancyAllowance",
  "postFixationResetRatePa",
  "inflationPa",
];

export interface ScenarioDraftFields {
  name: string;
  appreciationPa: string;
  rentIndexationPa: string;
  vacancyAllowance: string;
  postFixationResetRatePa: string;
  inflationPa: string;
  inflationShockDelta: string;
  inflationShockYears: string;
  rateShockDelta: string;
  rateShockYears: string;
  valueShockPct: string;
  valueShockYear: string;
}

export function overrideLabel(t: Dictionary, key: LevelKey): string {
  switch (key) {
    case "appreciationPa":
      return t.scenarios.fieldAppreciation;
    case "rentIndexationPa":
      return t.scenarios.fieldRentIndexation;
    case "vacancyAllowance":
      return t.scenarios.fieldVacancy;
    case "postFixationResetRatePa":
      return t.scenarios.fieldPostFixationReset;
    case "inflationPa":
      return t.scenarios.fieldInflation;
  }
}

/**
 * A temporary shock: a delta (%) held for N years (default DEFAULT_SHOCK_YEARS).
 * Blank delta = no shock; the years field is ignored unless a delta is set. On a
 * parse failure the relevant field key(s) are set on `errs` and undefined is returned.
 */
function parseShockBand(
  deltaRaw: string,
  yearsRaw: string,
  dKey: string,
  yKey: string,
  errs: Record<string, string>,
  t: Dictionary,
): ShockBand | undefined {
  if (deltaRaw.trim() === "") return undefined;
  const d = parsePercentToRatio(deltaRaw);
  if (d === null) {
    errs[dKey] = t.scenarios.invalidPct;
    return undefined;
  }
  let years = DEFAULT_SHOCK_YEARS;
  if (yearsRaw.trim() !== "") {
    const y = parseIntField(yearsRaw);
    if (y === null || y < 1) {
      errs[yKey] = t.scenarios.geOne;
      return undefined;
    }
    years = y;
  }
  return { deltaPa: d, durationYears: years };
}

export interface ScenarioDraftResult {
  errors: Record<string, string>;
  name: string;
  overrides: ScenarioOverrides;
}

/** Parse+validate an in-progress scenario draft into ScenarioOverrides. `errors` is
 *  empty when the draft is valid — the caller should still check before submitting. */
export function parseScenarioDraft(
  draft: ScenarioDraftFields,
  t: Dictionary,
): ScenarioDraftResult {
  const errs: Record<string, string> = {};
  if (draft.name.trim() === "") errs.name = t.scenarios.required;
  const overrides: ScenarioOverrides = {};

  // Level overrides: blank = inherit Base; non-empty must parse as a percent.
  for (const key of OVERRIDE_KEYS) {
    const raw = draft[key];
    if (raw.trim() === "") continue;
    const v = parsePercentToRatio(raw);
    if (v === null) errs[key] = t.scenarios.invalidPct;
    else overrides[key] = v;
  }

  const inflationShock = parseShockBand(
    draft.inflationShockDelta,
    draft.inflationShockYears,
    "inflationShockDelta",
    "inflationShockYears",
    errs,
    t,
  );
  if (inflationShock) overrides.inflationShock = inflationShock;
  const rateShock = parseShockBand(
    draft.rateShockDelta,
    draft.rateShockYears,
    "rateShockDelta",
    "rateShockYears",
    errs,
    t,
  );
  if (rateShock) overrides.rateShock = rateShock;

  // A permanent value crash landing at year `atYear` (default 0 = today).
  if (draft.valueShockPct.trim() !== "") {
    const pct = parsePercentToRatio(draft.valueShockPct);
    if (pct === null) errs.valueShockPct = t.scenarios.invalidPct;
    else {
      let atYear = 0;
      if (draft.valueShockYear.trim() !== "") {
        const y = parseIntField(draft.valueShockYear);
        if (y === null || y < 0) errs.valueShockYear = t.scenarios.geZero;
        else atYear = y;
      }
      if (!errs.valueShockYear) overrides.valueShock = { pct, atYear };
    }
  }

  return { errors: errs, name: draft.name.trim(), overrides };
}
