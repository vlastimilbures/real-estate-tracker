// Pure row ⇄ engine-input mappers. No IO, no driver imports. This is the ONLY place
// the TEXT-decimal / ISO-date DB representation is converted to/from engine types
// (decimal.js, branded Money / Rate / IsoDate). The engine itself never imports this file — data flows
// DB → mappers → engine, one way (CLAUDE.md §4). The row writers live in toRow.ts and
// the mortgage event JSON in loanEventsJson.ts (#471); this module re-exports the writers,
// so the boundary keeps one import path.
import type { Decimal } from "../lib/money";
import { mortgageBlock, rate } from "../engine";
import { DataError } from "./errors";
import * as g from "./guards";
import type { RowOf } from "./schema";
import { parseDraws, parsePrepayments, parseRecasts } from "./loanEventsJson";
import type {
  AcquisitionFunding,
  Assumptions,
  Property,
  MortgageBlock,
  Valuation,
  Lease,
  HoldingCost,
  Rate,
  ShockBand,
  Scenario,
  ScenarioOverrides,
} from "../engine";

/** The snake_case column name of a camelCase field (`purchasePrice` ⇒ `purchase_price`). */
export const toColumn = (field: string) =>
  field.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

// --- DB row shapes (all money/rates TEXT, dates TEXT ISO), from src/data/schema.ts ---

/** `active` is NOT NULL since v4; a NULL still reads as active (legacy row). */
export type PropertyRow = Omit<RowOf<"properties">, "active"> & {
  active: number | null;
};
export type MortgageBlockRow = RowOf<"mortgage_blocks">;
export type ValuationRow = RowOf<"valuations">;
export type LeaseRow = RowOf<"leases">;
export type HoldingCostRow = RowOf<"holding_costs">;
export type ScenarioRow = RowOf<"scenarios">;
export type AssumptionsRow = RowOf<"assumptions">;

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

// --- scenario overrides JSON ----------------------------------------------------
// Versioned since P5a (DR-037): `version: 1`. A row without `version` is the legacy
// shape (which also allowed the flat `valueShockPct`); migration v8 rewrites stored rows
// to v1 and the reader still accepts legacy JSON (e.g. from an old backup file).

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
const LEGACY_KEYS = new Set<string>([...V1_KEYS, "valueShockPct"]);

/** Parse stored overrides JSON (v1 or legacy) or throw SCENARIO_INVALID. */
export function parseOverrides(
  scenarioName: string,
  json: string,
): ScenarioOverrides {
  const bad = (problem: string, message?: string): never => {
    const line = `scenario "${scenarioName}": overrides ${problem}`;
    throw new DataError(
      "SCENARIO_INVALID",
      message ?? `A saved scenario cannot be read: ${line}.`,
      [line],
    );
  };
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

  const decimalAt = (k: string, v: unknown): Rate => {
    const d = g.parseDecimalText(v);
    return d ? rate(d) : bad(`${k} is not a decimal string`);
  };
  const isWhole = (v: unknown): v is number =>
    typeof v === "number" && Number.isInteger(v);
  const band = (k: string, v: unknown): ShockBand | undefined => {
    if (v === undefined) return undefined;
    const b = (v ?? {}) as { deltaPa?: unknown; durationYears?: unknown };
    const deltaPa = g.parseDecimalText(b.deltaPa);
    if (typeof v !== "object" || !deltaPa || !isWhole(b.durationYears))
      return bad(`${k} is not {deltaPa, durationYears}`);
    return { deltaPa: rate(deltaPa), durationYears: b.durationYears };
  };

  const overrides: ScenarioOverrides = {};
  for (const k of FLAT_KEYS)
    if (o[k] !== undefined) overrides[k] = decimalAt(k, o[k]);
  const inflationShock = band("inflationShock", o.inflationShock);
  if (inflationShock) overrides.inflationShock = inflationShock;
  const rateShock = band("rateShock", o.rateShock);
  if (rateShock) overrides.rateShock = rateShock;
  if (o.valueShock !== undefined) {
    const v = (o.valueShock ?? {}) as { pct?: unknown; atYear?: unknown };
    const pct = g.parseDecimalText(v.pct);
    // Legacy rows may omit atYear (a year-0 crash); v1 always writes it.
    const atYear =
      v.atYear === undefined && o.version === undefined ? 0 : v.atYear;
    if (typeof o.valueShock !== "object" || !pct || !isWhole(atYear))
      return bad("valueShock is not {pct, atYear}");
    overrides.valueShock = { pct: rate(pct), atYear };
  } else if (o.valueShockPct !== undefined) {
    // Legacy flat form from before timed corrections existed: a year-0 crash.
    overrides.valueShock = {
      pct: decimalAt("valueShockPct", o.valueShockPct),
      atYear: 0,
    };
  }
  return overrides;
}

// --- row → engine input --------------------------------------------------------

export function rowToProperty(r: PropertyRow): Property {
  const ref = { table: "properties", id: r.id };
  // address & garage are persisted for fidelity but aren't engine inputs.
  return {
    id: r.id,
    name: g.text(ref, "name", r.name),
    type: r.type ?? undefined,
    sizeM2: g.numOpt(ref, "size_m2", r.size_m2),
    purchaseDate: g.date(ref, "purchase_date", r.purchase_date),
    purchasePrice: g.moneyText(ref, "purchase_price", r.purchase_price),
    appreciationOverridePa: g.rateOpt(
      ref,
      "appreciation_override_pa",
      r.appreciation_override_pa,
    ),
    rentIndexOverridePa: g.rateOpt(
      ref,
      "rent_index_override_pa",
      r.rent_index_override_pa,
    ),
    active: r.active === 0 ? false : true, // NULL (legacy row) / 1 ⇒ active
    funding: rowToFunding(ref, r),
  };
}

/** The funding record (ADR 0119): undefined when every part is NULL (unknown). A
 *  blank note is no note. */
function rowToFunding(
  ref: g.RowRef,
  r: PropertyRow,
): AcquisitionFunding | undefined {
  const f: AcquisitionFunding = {};
  const ownCash = g.moneyOpt(ref, "own_cash", r.own_cash);
  const costs = g.moneyOpt(ref, "transaction_costs", r.transaction_costs);
  const works = g.moneyOpt(ref, "initial_works", r.initial_works);
  const note =
    r.funding_note == null ? "" : g.text(ref, "funding_note", r.funding_note);
  if (ownCash) f.ownCash = ownCash;
  if (costs) f.transactionCosts = costs;
  if (works) f.initialWorks = works;
  if (note.trim()) f.note = note;
  return Object.keys(f).length > 0 ? f : undefined;
}

export function rowToMortgageBlock(r: MortgageBlockRow): MortgageBlock {
  const ref = { table: "mortgage_blocks", id: r.id };
  // Stored rows are not value-checked here: a development loan without a term can exist
  // in the DB and the engine rejects it at termMonths (DR-051; entry-point rejection is
  // D-17). mortgageBlock keeps the object exactly as built.
  return mortgageBlock({
    id: r.id,
    propertyId: r.property_id,
    startDate: g.date(ref, "start_date", r.start_date),
    initialPrincipal: g.moneyText(
      ref,
      "initial_principal",
      r.initial_principal,
    ),
    fixationYears: g.num(ref, "fixation_years", r.fixation_years),
    interestRatePa: g.rateText(ref, "interest_rate_pa", r.interest_rate_pa),
    monthlyInstalment: g.moneyText(
      ref,
      "monthly_instalment",
      r.monthly_instalment,
    ),
    loanTermYears: g.numOpt(ref, "loan_term_years", r.loan_term_years),
    draws: parseDraws(ref, r.draws),
    prepayments: parsePrepayments(ref, r.prepayments),
    recasts: parseRecasts(ref, r.recasts),
    completionDate: g.dateOpt(
      ref,
      "interest_only_until",
      r.interest_only_until,
    ),
    contractMaturityDate: g.dateOpt(
      ref,
      "contract_maturity_date",
      r.contract_maturity_date,
    ),
  });
}

export function rowToValuation(r: ValuationRow): Valuation {
  const ref = { table: "valuations", id: r.id };
  return {
    id: r.id,
    propertyId: r.property_id,
    validFrom: g.date(ref, "valid_from", r.valid_from),
    validTo: g.dateOpt(ref, "valid_to", r.valid_to),
    marketValue: g.moneyText(ref, "market_value", r.market_value),
  };
}

export function rowToLease(r: LeaseRow): Lease {
  const ref = { table: "leases", id: r.id };
  return {
    id: r.id,
    propertyId: r.property_id,
    startDate: g.date(ref, "start_date", r.start_date),
    endDate: g.dateOpt(ref, "end_date", r.end_date),
    monthlyRent: g.moneyText(ref, "monthly_rent", r.monthly_rent),
  };
}

export function rowToHoldingCost(r: HoldingCostRow): HoldingCost {
  const ref = { table: "holding_costs", id: r.id };
  return {
    id: r.id,
    propertyId: r.property_id,
    propertyTaxYr: g.moneyOpt(ref, "property_tax_yr", r.property_tax_yr),
    insuranceYr: g.moneyOpt(ref, "insurance_yr", r.insurance_yr),
    mgmtPctRent: g.rateOpt(ref, "mgmt_pct_rent", r.mgmt_pct_rent),
    maintPctRent: g.rateOpt(ref, "maint_pct_rent", r.maint_pct_rent),
    svjMonthly: g.moneyOpt(ref, "svj_monthly", r.svj_monthly),
    otherYr: g.moneyOpt(ref, "other_yr", r.other_yr),
  };
}

export function rowToAssumptions(r: AssumptionsRow): Assumptions {
  const ref = { table: "assumptions", id: String(r.id) };
  const mon = (c: keyof AssumptionsRow) => g.moneyText(ref, c, r[c]);
  const rt = (c: keyof AssumptionsRow) => g.rateText(ref, c, r[c]);
  return {
    baseDate: g.date(ref, "base_date", r.base_date),
    appreciationPa: rt("appreciation_pa"),
    rentIndexationPa: rt("rent_indexation_pa"),
    vacancyAllowance: rt("vacancy_allowance"),
    postFixationResetRatePa: rt("post_fixation_reset_rate_pa"),
    horizonYears: g.num(ref, "horizon_years", r.horizon_years),
    inflationPa: rt("inflation_pa"),
    sellingCostPct: rt("selling_cost_pct"),
    defaults: {
      propertyTaxYr: mon("default_property_tax_yr"),
      insuranceYr: mon("default_insurance_yr"),
      mgmtPctRent: rt("default_mgmt_pct_rent"),
      maintPctRent: rt("default_maint_pct_rent"),
      svjMonthly: mon("default_svj_monthly"),
      otherYr: mon("default_other_yr"),
    },
  };
}

export function rowToScenario(r: ScenarioRow): Scenario {
  // created_at only orders the list in SQL (DR-181); the app never reads it (ADR 0123).
  return {
    id: r.id,
    name: g.text({ table: "scenarios", id: r.id }, "name", r.name),
    overrides: parseOverrides(r.name, r.overrides),
  };
}

// --- engine input → row --------------------------------------------------------

/** `createdAt` is the time of the write: an insert stores it, an update keeps the stored
 *  value (`upsertScenario`, ADR 0123). */
export function scenarioToRow(s: Scenario, createdAt: Date): ScenarioRow {
  return {
    id: s.id,
    name: s.name,
    overrides: serializeOverrides(s.overrides),
    // A full ISO timestamp, so same-day scenarios keep their creation order (DR-181).
    created_at: createdAt.toISOString(),
  };
}

export {
  assumptionsToRow,
  holdingCostToRow,
  leaseToRow,
  mortgageBlockToRow,
  propertyToRow,
  valuationToRow,
  type PropertyExtras,
} from "./toRow";
