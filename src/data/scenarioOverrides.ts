// The scenario overrides JSON column, both ways (#472, moved out of mappers.ts). Version 1
// (P5a, DR-037) is the only stored shape: the writer always stamps `version: 1`.
//
// The reader also takes the legacy shape: JSON without `version`, written before P5a. It
// may hold the flat `valueShockPct` and a `valueShock` without `atYear` (both a year-0
// crash). Old backup files still carry it, so restore upgrades every scenario with
// `upgradeLegacyOverrides` before reading it (backup/restorePlan.ts). The legacy rules
// below (`LEGACY_KEYS`, `legacyValueShock`) are FROZEN: never change them. A new version
// gets its own reader.
import type { Decimal } from "../lib/money";
import { rate } from "../engine";
import { DataError } from "./errors";
import * as g from "./guards";
import type { Rate, ScenarioOverrides, ShockBand, ValueShock } from "../engine";

export const OVERRIDES_VERSION = 1;

const FLAT_KEYS = [
  "appreciationPa",
  "rentIndexationPa",
  "vacancyAllowance",
  "postFixationResetRatePa",
  "inflationPa",
] as const;
/** The keys a v1 overrides JSON may hold (a restore test checks its fixture holds all). */
export const V1_KEYS = new Set<string>([
  "version",
  ...FLAT_KEYS,
  "inflationShock",
  "rateShock",
  "valueShock",
]);
/** Frozen: the keys a legacy (unversioned) overrides JSON may hold. */
const LEGACY_KEYS = new Set<string>([...V1_KEYS, "valueShockPct"]);

/**
 * Scenario overrides → JSON. Flat level deltas are decimal strings; the time-aware
 * shocks serialize as nested objects ({deltaPa, durationYears} / {pct, atYear}).
 * Undefined keys are omitted (so the Base path stores `{"version":1}`).
 */
export function serializeOverrides(overrides: ScenarioOverrides): string {
  const out: Record<string, unknown> = { version: OVERRIDES_VERSION };
  const put = (k: string, v: Decimal | undefined) => {
    if (v != null) out[k] = v.toString();
  };
  put("appreciationPa", overrides.appreciationPa);
  put("rentIndexationPa", overrides.rentIndexationPa);
  put("vacancyAllowance", overrides.vacancyAllowance);
  put("postFixationResetRatePa", overrides.postFixationResetRatePa);
  put("inflationPa", overrides.inflationPa);
  if (overrides.inflationShock) {
    out.inflationShock = {
      deltaPa: overrides.inflationShock.deltaPa.toString(),
      durationYears: overrides.inflationShock.durationYears,
    };
  }
  if (overrides.rateShock) {
    out.rateShock = {
      deltaPa: overrides.rateShock.deltaPa.toString(),
      durationYears: overrides.rateShock.durationYears,
    };
  }
  if (overrides.valueShock) {
    out.valueShock = {
      pct: overrides.valueShock.pct.toString(),
      atYear: overrides.valueShock.atYear,
    };
  }
  return JSON.stringify(out);
}

/** Throws SCENARIO_INVALID for one problem of the scenario's overrides. */
type Bad = (problem: string, message?: string) => never;

function badFor(scenarioName: string): Bad {
  return (problem, message) => {
    const line = `scenario "${scenarioName}": overrides ${problem}`;
    throw new DataError(
      "SCENARIO_INVALID",
      message ?? `A saved scenario cannot be read: ${line}.`,
      [line],
    );
  };
}

/** The JSON object, its version (1 or none) and its keys checked. */
function readObject(
  scenarioName: string,
  json: string,
  bad: Bad,
): Record<string, unknown> {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return bad(
      "is not valid JSON",
      `Corrupt scenario overrides JSON for "${scenarioName}"`,
    );
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw))
    return bad("is not a JSON object");
  const o = raw as Record<string, unknown>;
  if (o.version !== undefined && o.version !== OVERRIDES_VERSION)
    return bad(`has unsupported version ${JSON.stringify(o.version)}`);
  const allowed = o.version === undefined ? LEGACY_KEYS : V1_KEYS;
  for (const k of Object.keys(o))
    if (!allowed.has(k)) bad(`has an unknown key "${k}"`);
  return o;
}

const decimalAt = (k: string, v: unknown, bad: Bad): Rate => {
  const d = g.parseDecimalText(v);
  return d ? rate(d) : bad(`${k} is not a decimal string`);
};

const isWhole = (v: unknown): v is number =>
  typeof v === "number" && Number.isInteger(v);

function readBand(k: string, v: unknown, bad: Bad): ShockBand | undefined {
  if (v === undefined) return undefined;
  const b = (v ?? {}) as { deltaPa?: unknown; durationYears?: unknown };
  const deltaPa = g.parseDecimalText(b.deltaPa);
  if (typeof v !== "object" || !deltaPa || !isWhole(b.durationYears))
    return bad(`${k} is not {deltaPa, durationYears}`);
  return { deltaPa: rate(deltaPa), durationYears: b.durationYears };
}

/** `valueShock` {pct, atYear}; a legacy one may omit atYear (a year-0 crash, frozen). */
function readValueShock(
  o: Record<string, unknown>,
  bad: Bad,
): ValueShock | undefined {
  if (o.valueShock === undefined) return legacyValueShock(o, bad);
  const v = (o.valueShock ?? {}) as { pct?: unknown; atYear?: unknown };
  const pct = g.parseDecimalText(v.pct);
  const atYear =
    v.atYear === undefined && o.version === undefined ? 0 : v.atYear;
  if (typeof o.valueShock !== "object" || !pct || !isWhole(atYear))
    return bad("valueShock is not {pct, atYear}");
  return { pct: rate(pct), atYear };
}

/** Frozen: the legacy flat `valueShockPct`, from before timed corrections existed (a
 *  year-0 crash). Only a legacy JSON can hold the key (`LEGACY_KEYS`). */
function legacyValueShock(
  o: Record<string, unknown>,
  bad: Bad,
): ValueShock | undefined {
  if (o.valueShockPct === undefined) return undefined;
  return { pct: decimalAt("valueShockPct", o.valueShockPct, bad), atYear: 0 };
}

/** Parse stored overrides JSON (v1 or legacy) or throw SCENARIO_INVALID. */
export function parseOverrides(
  scenarioName: string,
  json: string,
): ScenarioOverrides {
  const bad = badFor(scenarioName);
  const o = readObject(scenarioName, json, bad);
  const overrides: ScenarioOverrides = {};
  for (const k of FLAT_KEYS)
    if (o[k] !== undefined) overrides[k] = decimalAt(k, o[k], bad);
  const inflationShock = readBand("inflationShock", o.inflationShock, bad);
  if (inflationShock) overrides.inflationShock = inflationShock;
  const rateShock = readBand("rateShock", o.rateShock, bad);
  if (rateShock) overrides.rateShock = rateShock;
  const valueShock = readValueShock(o, bad);
  if (valueShock) overrides.valueShock = valueShock;
  return overrides;
}

/**
 * The overrides of a backup scenario (v1 or legacy) as stored v1 JSON, or throw
 * SCENARIO_INVALID. Restore runs it on every scenario before reading the rows, so the
 * database only ever holds v1 (what the old migration 8 did to stored rows).
 */
export function upgradeLegacyOverrides(
  scenarioName: string,
  json: string,
): string {
  return serializeOverrides(parseOverrides(scenarioName, json));
}
