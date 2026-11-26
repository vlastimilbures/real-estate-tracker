// Pure row ⇄ engine-input mappers. No IO, no driver imports. This is the ONLY place
// the TEXT-decimal / ISO-date DB representation is converted to/from engine types
// (decimal.js, branded Money / Rate / IsoDate). The engine itself never imports this file — data flows
// DB → mappers → engine, one way (CLAUDE.md §4). The row writers live in toRow.ts and
// the mortgage event JSON in loanEventsJson.ts, the scenario overrides JSON in
// scenarioOverrides.ts; this module re-exports the writers, so the boundary keeps
// one import path.
import { mortgageBlock } from "../engine";
import * as g from "./guards";
import type { RowOf } from "./schema";
import { parseDraws, parsePrepayments, parseRecasts } from "./loanEventsJson";
import { parseOverrides, serializeOverrides } from "./scenarioOverrides";
import type {
  AcquisitionFunding,
  StoredAssumptions,
  Property,
  MortgageBlock,
  Valuation,
  Lease,
  HoldingCost,
  Scenario,
} from "../engine";

/** The snake_case column name of a camelCase field (`purchasePrice` ⇒ `purchase_price`). */
export const toColumn = (field: string) =>
  field.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

// --- DB row shapes (all money/rates TEXT, dates TEXT ISO), from src/data/schema.ts ---

/** The `active` column is NOT NULL (default 1); the row type still admits NULL, which
 *  reads as active. */
export type PropertyRow = Omit<RowOf<"properties">, "active"> & {
  active: number | null;
};
export type MortgageBlockRow = RowOf<"mortgage_blocks">;
export type ValuationRow = RowOf<"valuations">;
export type LeaseRow = RowOf<"leases">;
export type HoldingCostRow = RowOf<"holding_costs">;
export type ScenarioRow = RowOf<"scenarios">;
export type AssumptionsRow = RowOf<"assumptions">;

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
    active: r.active === 0 ? false : true, // 1 (or a NULL) ⇒ active
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
  // in the DB and the engine rejects it at termMonths (entry-point rejection is
  // ADR 0017). mortgageBlock keeps the object exactly as built.
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

export function rowToAssumptions(r: AssumptionsRow): StoredAssumptions {
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
  // created_at only orders the list in SQL; the app never reads it (ADR 0123).
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
    // A full ISO timestamp, so same-day scenarios keep their creation order.
    created_at: createdAt.toISOString(),
  };
}

/** The v1 key set, re-exported on this path for the restore test, which imports it from
 *  here.
 *  @internal */
export { V1_KEYS } from "./scenarioOverrides";

export {
  assumptionsToRow,
  holdingCostToRow,
  leaseToRow,
  mortgageBlockToRow,
  propertyToRow,
  valuationToRow,
  type PropertyExtras,
} from "./toRow";
