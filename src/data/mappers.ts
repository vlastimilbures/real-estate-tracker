// Pure row ⇄ engine-input mappers. No IO, no driver imports. This is the ONLY place
// the TEXT-decimal / ISO-date DB representation is converted to/from engine types
// (decimal.js, branded Money / Rate / IsoDate). The engine itself never imports this file — data flows
// DB → mappers → engine, one way (CLAUDE.md §4).
import type { Decimal } from "../lib/money";
import { money, mortgageBlock, rate } from "../engine";
import { DataError } from "./errors";
import * as g from "./guards";
import type {
  Assumptions,
  Property,
  MortgageBlock,
  MortgageDraw,
  Valuation,
  Lease,
  HoldingCost,
  Rate,
  ShockBand,
  Scenario,
  ScenarioOverrides,
} from "../engine";

// --- DB row shapes (all money/rates TEXT, dates TEXT ISO) ----------------------

export interface PropertyRow {
  id: string;
  name: string;
  address: string | null;
  type: string | null;
  size_m2: number | null;
  garage: number | null;
  purchase_date: string;
  purchase_price: string;
  appreciation_override_pa: string | null;
  rent_index_override_pa: string | null;
  active: number | null;
}

export interface MortgageBlockRow {
  id: string;
  property_id: string;
  start_date: string;
  initial_principal: string;
  fixation_years: number;
  interest_rate_pa: string;
  monthly_instalment: string;
  loan_term_years: number | null;
  draws: string | null; // JSON [{date, amount}] or NULL
  interest_only_until: string | null; // ISO date or NULL
  contract_maturity_date: string | null; // ISO date or NULL (D-29)
}

export interface ValuationRow {
  id: string;
  property_id: string;
  valid_from: string;
  valid_to: string | null;
  market_value: string;
}

export interface LeaseRow {
  id: string;
  property_id: string;
  start_date: string;
  end_date: string | null;
  monthly_rent: string;
}

export interface HoldingCostRow {
  id: string;
  property_id: string;
  property_tax_yr: string | null;
  insurance_yr: string | null;
  mgmt_pct_rent: string | null;
  maint_pct_rent: string | null;
  svj_monthly: string | null;
  other_yr: string | null;
}

export interface ScenarioRow {
  id: string;
  name: string;
  overrides: string; // JSON: optional level deltas + nested shock descriptors
  created_at: string;
}

export interface AssumptionsRow {
  id: number;
  base_date: string;
  appreciation_pa: string;
  rent_indexation_pa: string;
  vacancy_allowance: string;
  post_fixation_reset_rate_pa: string;
  horizon_years: number;
  inflation_pa: string;
  default_property_tax_yr: string;
  default_insurance_yr: string;
  default_mgmt_pct_rent: string;
  default_maint_pct_rent: string;
  default_svj_monthly: string;
  default_other_yr: string;
}

// --- small helpers -------------------------------------------------------------
// Reads go through the DR-037 guards (guards.ts): shape-checked, typed DataError on
// a value the column cannot hold.

/** Decimal → TEXT, undefined → NULL. */
function dtext(v: Decimal | undefined): string | null {
  return v == null ? null : v.toString();
}
/** Date → ISO yyyy-mm-dd. */
function isoTextReq(v: Date): string {
  return v.toISOString().slice(0, 10);
}
/** Date → ISO yyyy-mm-dd, undefined → NULL. */
function isoText(v: Date | undefined): string | null {
  return v == null ? null : isoTextReq(v);
}
/** JSON tranche array → MortgageDraw[] (sorted), NULL/empty → undefined. */
function parseDraws(
  ref: g.RowRef,
  v: string | null,
): MortgageDraw[] | undefined {
  if (v == null) return undefined;
  const bad = (problem: string): never => {
    const line = `${ref.table} ${ref.id}: draws ${problem}`;
    throw new DataError(
      "ROW_INVALID",
      `Corrupt mortgage draws JSON: ${line}.`,
      [line],
    );
  };
  let arr: unknown;
  try {
    arr = JSON.parse(v);
  } catch {
    return bad("is not valid JSON");
  }
  if (!Array.isArray(arr)) return bad("is not an array");
  const draws = arr
    .map((d: unknown) => {
      const o = (d ?? {}) as { date?: unknown; amount?: unknown };
      if (typeof o.date !== "string" || !g.isIsoDate(o.date))
        return bad("has an invalid date");
      const amount = g.parseDecimalText(o.amount);
      if (!amount) return bad("has an invalid amount");
      return { date: g.date(ref, "draws", o.date), amount: money(amount) };
    })
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  return draws.length ? draws : undefined;
}
/** MortgageDraw[] → JSON (amounts as decimal strings), empty/undefined → NULL. */
function drawsToJson(draws: MortgageDraw[] | undefined): string | null {
  if (!draws || draws.length === 0) return null;
  return JSON.stringify(
    draws.map((d) => ({
      date: isoTextReq(d.date),
      amount: d.amount.toString(),
    })),
  );
}

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
const V1_KEYS = new Set<string>([
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
  };
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
  const ref = { table: "scenarios", id: r.id };
  // created_at is a full ISO timestamp (yyyy-mm-dd in rows written before DR-181);
  // only its date part is read.
  const createdAt =
    typeof r.created_at === "string" ? r.created_at.slice(0, 10) : r.created_at;
  return {
    id: r.id,
    name: r.name,
    overrides: parseOverrides(r.name, r.overrides),
    createdAt: g.date(ref, "created_at", createdAt),
  };
}

// --- engine input → row (extra fields for DB fidelity passed alongside) --------

export function propertyToRow(
  p: Property,
  extra: { address?: string | null; garage?: boolean | null } = {},
): PropertyRow {
  return {
    id: p.id,
    name: p.name,
    address: extra.address ?? null,
    type: p.type ?? null,
    size_m2: p.sizeM2 ?? null,
    garage: extra.garage == null ? null : extra.garage ? 1 : 0,
    purchase_date: isoTextReq(p.purchaseDate),
    purchase_price: p.purchasePrice.toString(),
    appreciation_override_pa: dtext(p.appreciationOverridePa),
    rent_index_override_pa: dtext(p.rentIndexOverridePa),
    active: p.active === false ? 0 : 1,
  };
}

export function mortgageBlockToRow(m: MortgageBlock): MortgageBlockRow {
  return {
    id: m.id,
    property_id: m.propertyId,
    start_date: isoTextReq(m.startDate),
    initial_principal: m.initialPrincipal.toString(),
    fixation_years: m.fixationYears,
    interest_rate_pa: m.interestRatePa.toString(),
    monthly_instalment: m.monthlyInstalment.toString(),
    loan_term_years: m.loanTermYears ?? null,
    draws: drawsToJson(m.draws),
    interest_only_until: isoText(m.completionDate),
    contract_maturity_date: isoText(m.contractMaturityDate),
  };
}

export function valuationToRow(v: Valuation): ValuationRow {
  return {
    id: v.id,
    property_id: v.propertyId,
    valid_from: isoTextReq(v.validFrom),
    valid_to: isoText(v.validTo),
    market_value: v.marketValue.toString(),
  };
}

export function leaseToRow(l: Lease): LeaseRow {
  return {
    id: l.id,
    property_id: l.propertyId,
    start_date: isoTextReq(l.startDate),
    end_date: isoText(l.endDate),
    monthly_rent: l.monthlyRent.toString(),
  };
}

export function holdingCostToRow(h: HoldingCost): HoldingCostRow {
  return {
    id: h.id,
    property_id: h.propertyId,
    property_tax_yr: dtext(h.propertyTaxYr),
    insurance_yr: dtext(h.insuranceYr),
    mgmt_pct_rent: dtext(h.mgmtPctRent),
    maint_pct_rent: dtext(h.maintPctRent),
    svj_monthly: dtext(h.svjMonthly),
    other_yr: dtext(h.otherYr),
  };
}

export function scenarioToRow(s: Scenario): ScenarioRow {
  return {
    id: s.id,
    name: s.name,
    overrides: serializeOverrides(s.overrides),
    // A full ISO timestamp, so same-day scenarios keep their creation order (DR-181).
    created_at: s.createdAt.toISOString(),
  };
}

export function assumptionsToRow(a: Assumptions): AssumptionsRow {
  return {
    id: 1,
    base_date: isoTextReq(a.baseDate),
    appreciation_pa: a.appreciationPa.toString(),
    rent_indexation_pa: a.rentIndexationPa.toString(),
    vacancy_allowance: a.vacancyAllowance.toString(),
    post_fixation_reset_rate_pa: a.postFixationResetRatePa.toString(),
    horizon_years: a.horizonYears,
    inflation_pa: a.inflationPa.toString(),
    default_property_tax_yr: a.defaults.propertyTaxYr.toString(),
    default_insurance_yr: a.defaults.insuranceYr.toString(),
    default_mgmt_pct_rent: a.defaults.mgmtPctRent.toString(),
    default_maint_pct_rent: a.defaults.maintPctRent.toString(),
    default_svj_monthly: a.defaults.svjMonthly.toString(),
    default_other_yr: a.defaults.otherYr.toString(),
  };
}
