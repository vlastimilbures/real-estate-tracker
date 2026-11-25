// Engine input → row (#471, split out of mappers.ts): the write half of the mapper
// boundary. Money and rates become TEXT decimal strings, dates TEXT ISO yyyy-mm-dd
// (CLAUDE.md §5); the extra fields kept for DB fidelity are passed alongside.
import type { Decimal } from "../lib/money";
import { SELLING_COST_DEFAULT } from "./schema";
import {
  drawsToJson,
  isoTextReq,
  prepaymentsToJson,
  recastsToJson,
} from "./loanEventsJson";
import type {
  PropertyRow,
  MortgageBlockRow,
  ValuationRow,
  LeaseRow,
  HoldingCostRow,
  AssumptionsRow,
} from "./mappers";
import type {
  StoredAssumptions,
  Property,
  MortgageBlock,
  Valuation,
  Lease,
  HoldingCost,
} from "../engine";

/** Decimal → TEXT, undefined → NULL. */
function dtext(v: Decimal | undefined): string | null {
  return v == null ? null : v.toString();
}
/** Date → ISO yyyy-mm-dd, undefined → NULL. */
function isoText(v: Date | undefined): string | null {
  return v == null ? null : isoTextReq(v);
}

/** The stored property fields that are not engine inputs. Every property write passes
 *  them, so none can write NULL by leaving them out (ADR 0184 §3). */
export interface PropertyExtras {
  address: string | null;
  garage: boolean | null;
}

export function propertyToRow(p: Property, extra: PropertyExtras): PropertyRow {
  return {
    id: p.id,
    name: p.name,
    address: extra.address,
    type: p.type ?? null,
    size_m2: p.sizeM2 ?? null,
    garage: extra.garage == null ? null : extra.garage ? 1 : 0,
    purchase_date: isoTextReq(p.purchaseDate),
    purchase_price: p.purchasePrice.toString(),
    appreciation_override_pa: dtext(p.appreciationOverridePa),
    rent_index_override_pa: dtext(p.rentIndexOverridePa),
    active: p.active === false ? 0 : 1,
    own_cash: dtext(p.funding?.ownCash),
    transaction_costs: dtext(p.funding?.transactionCosts),
    initial_works: dtext(p.funding?.initialWorks),
    funding_note: p.funding?.note?.trim() ? p.funding.note : null,
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
    prepayments: prepaymentsToJson(m.prepayments),
    recasts: recastsToJson(m.recasts),
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

export function assumptionsToRow(a: StoredAssumptions): AssumptionsRow {
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
    selling_cost_pct: (a.sellingCostPct ?? SELLING_COST_DEFAULT).toString(),
  };
}
