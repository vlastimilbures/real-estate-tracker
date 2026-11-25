// Every named CHECK constraint of the current schema, with what a failed write on it means
// (#470). One list: src/data/schema.ts takes each table's checks from it and
// src/ui/model/writeError.ts its constraint-name map. It sits in lib because ui/model may
// not import data at runtime (ADR 0072); lib imports nothing, so the rules are written
// as literals and type-checked where writeError.ts reads them (they are engine
// ValidationCodes, or "flag" / "json"). A drift test pins the names to the migrated
// database (src/data/__tests__/schema.test.ts).

/** One CHECK: `field` is the form field it guards, named like the engine field (the
 *  property modal maps these to its snake_case keys); none when no one field shows it. */
interface CheckConstraint {
  readonly table: string;
  /** Constraint name: shows up in SQLite's "CHECK constraint failed: <name>". */
  readonly name: string;
  readonly rule: string;
  readonly field?: string;
}

export const CHECK_CONSTRAINTS = [
  // v7
  {
    table: "properties",
    name: "property_purchase_date_iso",
    rule: "INVALID_DATE",
    field: "purchaseDate",
  },
  {
    table: "properties",
    name: "property_purchase_price_not_negative",
    rule: "NEGATIVE_AMOUNT",
    field: "purchasePrice",
  },
  { table: "properties", name: "property_active_flag", rule: "flag" },
  {
    table: "properties",
    name: "property_garage_flag",
    rule: "flag",
    field: "garage",
  },
  // v10 (ADR 0119)
  {
    table: "properties",
    name: "property_own_cash_not_negative",
    rule: "NEGATIVE_AMOUNT",
    field: "ownCash",
  },
  {
    table: "properties",
    name: "property_transaction_costs_not_negative",
    rule: "NEGATIVE_AMOUNT",
    field: "transactionCosts",
  },
  {
    table: "properties",
    name: "property_initial_works_not_negative",
    rule: "NEGATIVE_AMOUNT",
    field: "initialWorks",
  },
  // v7
  {
    table: "mortgage_blocks",
    name: "mortgage_start_date_iso",
    rule: "INVALID_DATE",
    field: "startDate",
  },
  {
    table: "mortgage_blocks",
    name: "mortgage_principal_not_negative",
    rule: "NEGATIVE_AMOUNT",
    field: "initialPrincipal",
  },
  {
    table: "mortgage_blocks",
    name: "mortgage_instalment_not_negative",
    rule: "NEGATIVE_AMOUNT",
    field: "monthlyInstalment",
  },
  {
    table: "mortgage_blocks",
    name: "mortgage_rate_0_to_1",
    rule: "RATE_OUT_OF_RANGE",
    field: "interestRatePa",
  },
  {
    table: "mortgage_blocks",
    name: "mortgage_fixation_whole_years",
    rule: "INVALID_TERM",
    field: "fixationYears",
  },
  {
    table: "mortgage_blocks",
    name: "mortgage_term_positive",
    rule: "INVALID_TERM",
    field: "loanTermYears",
  },
  {
    table: "mortgage_blocks",
    name: "mortgage_interest_only_until_iso",
    rule: "INVALID_DATE",
    field: "completionDate",
  },
  {
    table: "mortgage_blocks",
    name: "mortgage_contract_maturity_iso",
    rule: "INVALID_DATE",
  },
  {
    table: "mortgage_blocks",
    name: "mortgage_draws_json",
    rule: "json",
    field: "draws",
  },
  // v9 (ADR 0109)
  {
    table: "mortgage_blocks",
    name: "mortgage_prepayments_json",
    rule: "json",
    field: "prepayments",
  },
  {
    table: "mortgage_blocks",
    name: "mortgage_recasts_json",
    rule: "json",
    field: "recasts",
  },
  // v7
  {
    table: "valuations",
    name: "valuation_valid_from_iso",
    rule: "INVALID_DATE",
    field: "validFrom",
  },
  {
    table: "valuations",
    name: "valuation_valid_to_iso",
    rule: "INVALID_DATE",
    field: "validTo",
  },
  {
    table: "valuations",
    name: "valuation_end_not_before_start",
    rule: "END_BEFORE_START",
    field: "validTo",
  },
  {
    table: "valuations",
    name: "valuation_value_not_negative",
    rule: "NEGATIVE_AMOUNT",
    field: "marketValue",
  },
  {
    table: "leases",
    name: "lease_start_date_iso",
    rule: "INVALID_DATE",
    field: "startDate",
  },
  {
    table: "leases",
    name: "lease_end_date_iso",
    rule: "INVALID_DATE",
    field: "endDate",
  },
  {
    table: "leases",
    name: "lease_end_not_before_start",
    rule: "END_BEFORE_START",
    field: "endDate",
  },
  {
    table: "leases",
    name: "lease_rent_not_negative",
    rule: "NEGATIVE_AMOUNT",
    field: "monthlyRent",
  },
  {
    table: "assumptions",
    name: "assumptions_base_date_iso",
    rule: "INVALID_DATE",
    field: "baseDate",
  },
  {
    table: "assumptions",
    name: "assumptions_horizon_positive",
    rule: "HORIZON_NOT_POSITIVE",
    field: "horizonYears",
  },
  {
    table: "assumptions",
    name: "assumptions_vacancy_0_to_1",
    rule: "RATE_OUT_OF_RANGE",
    field: "vacancyAllowance",
  },
  {
    table: "assumptions",
    name: "assumptions_mgmt_0_to_1",
    rule: "RATE_OUT_OF_RANGE",
    field: "mgmtPctRent",
  },
  {
    table: "assumptions",
    name: "assumptions_maint_0_to_1",
    rule: "RATE_OUT_OF_RANGE",
    field: "maintPctRent",
  },
  // v11 (ADR 0183)
  {
    table: "assumptions",
    name: "assumptions_selling_cost_0_to_1",
    rule: "RATE_OUT_OF_RANGE",
    field: "sellingCostPct",
  },
  // v7
  { table: "scenarios", name: "scenario_overrides_json", rule: "json" },
] as const satisfies readonly CheckConstraint[];
