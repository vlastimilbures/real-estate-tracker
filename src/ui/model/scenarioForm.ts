// Pure draft-parsing for the scenario create/edit form. Kept out of ScenarioForm.tsx
// so it's unit-testable without mounting the component (mirrors ./mortgageForm.ts).
import { collectValues, type FieldSpec } from "./formParse";
import { formRules } from "./formParsers";
import { INT_RANGES } from "../../lib/intRanges";
import { formWriteErrors } from "./writeError";
import type {
  EngineValidationError,
  Rate,
  ScenarioOverrides,
  ShockBand,
} from "../../engine";
import type { Dictionary } from "../../i18n";
import type { WriteError } from "../../state/writeError";

// A temporary shock reverts to trend after this many years (shared with the preset bar).
export const DEFAULT_SHOCK_YEARS = 3;

// A shock's years and the crash year reach at most the longest horizon (ADR 0140 §4).
const SHOCK_YEARS = { min: 1, max: INT_RANGES.horizonYears.max };
const CRASH_YEAR = { min: 0, max: INT_RANGES.horizonYears.max };

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

/** The draft's parsed fields; all optional, a blank one inherits (or means no shock). */
function scenarioSpecs(t: Dictionary) {
  const s = t.scenarios;
  return [
    ...OVERRIDE_KEYS.map(
      (key) =>
        ({
          name: key,
          label: overrideLabel(t, key),
          kind: "pct",
          optional: true,
        }) as const,
    ),
    {
      name: "inflationShockDelta",
      label: s.fieldInflation,
      kind: "pct",
      optional: true,
    },
    {
      name: "inflationShockYears",
      label: s.fieldInflation,
      kind: "int",
      optional: true,
      range: SHOCK_YEARS,
    },
    {
      name: "rateShockDelta",
      label: s.fieldPostFixationReset,
      kind: "pct",
      optional: true,
    },
    {
      name: "rateShockYears",
      label: s.fieldPostFixationReset,
      kind: "int",
      optional: true,
      range: SHOCK_YEARS,
    },
    { name: "valueShockPct", label: s.groupCrash, kind: "pct", optional: true },
    {
      name: "valueShockYear",
      label: s.groupCrash,
      kind: "int",
      optional: true,
      range: CRASH_YEAR,
    },
  ] as const satisfies readonly FieldSpec[];
}

/** Each timed field and the field it times: its years count only once that one is set. */
const TIMED = [
  ["inflationShockYears", "inflationShockDelta"],
  ["rateShockYears", "rateShockDelta"],
  ["valueShockYear", "valueShockPct"],
] as const;

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
  const { values: v, errors: errs } = collectValues(
    scenarioSpecs(t),
    { ...draft },
    formRules(t),
  );
  // A blank or invalid delta (or crash) ignores its years.
  for (const [years, of] of TIMED) {
    if (v[of] === null || errs[of] !== undefined) delete errs[years];
  }
  if (draft.name.trim() === "") errs.name = t.forms.required;
  const overrides: ScenarioOverrides = {};

  // Level overrides: blank = inherit Base.
  for (const key of OVERRIDE_KEYS) {
    const level = v[key];
    if (!errs[key] && level !== null) overrides[key] = level;
  }

  // A temporary shock: a delta (%) held for N years (default DEFAULT_SHOCK_YEARS).
  const band = (
    delta: Rate | null,
    years: number | null,
  ): ShockBand | undefined =>
    delta === null
      ? undefined
      : { deltaPa: delta, durationYears: years ?? DEFAULT_SHOCK_YEARS };
  if (!errs.inflationShockDelta && !errs.inflationShockYears) {
    const inflationShock = band(v.inflationShockDelta, v.inflationShockYears);
    if (inflationShock) overrides.inflationShock = inflationShock;
  }
  if (!errs.rateShockDelta && !errs.rateShockYears) {
    const rateShock = band(v.rateShockDelta, v.rateShockYears);
    if (rateShock) overrides.rateShock = rateShock;
  }

  // A permanent value crash landing at year `atYear` (default 0 = today).
  if (!errs.valueShockPct && !errs.valueShockYear && v.valueShockPct !== null) {
    overrides.valueShock = {
      pct: v.valueShockPct,
      atYear: v.valueShockYear ?? 0,
    };
  }

  return { errors: errs, name: draft.name.trim(), overrides };
}

/** The form field of a rule on a shock: the crash's percentage, or the delta of a shock
 *  that takes its level out of range (ADR 0128 §3). Other shock rules (the years) stay on
 *  the shock, shown above the buttons: the parser already bounds them. */
function shockField(x: EngineValidationError): string | undefined {
  if (x.field === "valueShock") return "valueShockPct";
  if (x.code === "SHOCKED_RATE_OUT_OF_RANGE") return "rateShockDelta";
  if (x.code === "SHOCKED_INFLATION_OUT_OF_RANGE") return "inflationShockDelta";
  return x.field;
}

/** A refused save, split for the form (ADR 0123, ADR 0128): the store checks a scenario
 *  with the engine's assumption rules, which name the override. A rule on a level, the
 *  value crash or a shocked level shows on that field in the engine's words; anything
 *  else shows above the buttons. */
export function scenarioWriteErrors(
  t: Dictionary,
  e: WriteError,
): { fieldErrors: Record<string, string>; formError: string | null } {
  const onForm: WriteError =
    e.kind === "input"
      ? { ...e, errors: e.errors.map((x) => ({ ...x, field: shockField(x) })) }
      : e;
  return formWriteErrors(t, onForm, [
    ...OVERRIDE_KEYS,
    "valueShockPct",
    "rateShockDelta",
    "inflationShockDelta",
  ]);
}
