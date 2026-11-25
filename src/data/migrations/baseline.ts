// The frozen version 8 schema (ADR 0230), split out of the runner (#472). Never edit it:
// a schema change is a new step in steps.ts.

/**
 * The schema at version 8 (ADR 0230): the DDL exactly as steps 1–8 left it in
 * `sqlite_master` (the tables quoted as SQLite rewrote them when the version 7 rebuild
 * renamed them), so a new install ends at the same schema as before the baseline
 * (`src/data/__tests__/baseline.test.ts`). `steps` are the schema_migrations rows a new
 * install records for it, under their old names. Frozen: never edit it, add a step.
 */
export const BASELINE = {
  version: 8,
  steps: [
    { version: 1, name: "initial schema" },
    { version: 2, name: "mortgage loan term" },
    { version: 3, name: "mortgage development draws + interest-only" },
    { version: 4, name: "property active flag" },
    { version: 5, name: "app meta (first-run seed flag)" },
    { version: 6, name: "mortgage contract maturity date" },
    { version: 7, name: "constraints (unique natural keys, checks)" },
    { version: 8, name: "versioned scenario overrides JSON" },
  ],
  sql: `
      CREATE TABLE app_meta (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE "properties" (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        address TEXT,
        type TEXT,
        size_m2 INTEGER,
        garage INTEGER,
        purchase_date TEXT NOT NULL,
        purchase_price TEXT NOT NULL,
        appreciation_override_pa TEXT,
        rent_index_override_pa TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        CONSTRAINT property_purchase_date_iso CHECK (purchase_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
        CONSTRAINT property_purchase_price_not_negative CHECK (purchase_price NOT GLOB '-*'),
        CONSTRAINT property_active_flag CHECK (active IN (0, 1)),
        CONSTRAINT property_garage_flag CHECK (garage IN (0, 1)),
        UNIQUE (name)
      );

      CREATE TABLE "mortgage_blocks" (
        id TEXT PRIMARY KEY,
        property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
        start_date TEXT NOT NULL,
        initial_principal TEXT NOT NULL,
        fixation_years INTEGER NOT NULL,
        interest_rate_pa TEXT NOT NULL,
        monthly_instalment TEXT NOT NULL,
        loan_term_years INTEGER,
        draws TEXT,
        interest_only_until TEXT,
        contract_maturity_date TEXT,
        CONSTRAINT mortgage_start_date_iso CHECK (start_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
        CONSTRAINT mortgage_principal_not_negative CHECK (initial_principal NOT GLOB '-*'),
        CONSTRAINT mortgage_instalment_not_negative CHECK (monthly_instalment NOT GLOB '-*'),
        CONSTRAINT mortgage_rate_0_to_1 CHECK (CAST(interest_rate_pa AS REAL) BETWEEN 0 AND 1),
        CONSTRAINT mortgage_fixation_whole_years CHECK (typeof(fixation_years) = 'integer' AND fixation_years >= 0),
        CONSTRAINT mortgage_term_positive CHECK (loan_term_years > 0),
        CONSTRAINT mortgage_interest_only_until_iso CHECK (interest_only_until GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
        CONSTRAINT mortgage_contract_maturity_iso CHECK (contract_maturity_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
        CONSTRAINT mortgage_draws_json CHECK (json_valid(draws)),
        UNIQUE (property_id, start_date)
      );

      CREATE TABLE "valuations" (
        id TEXT PRIMARY KEY,
        property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
        valid_from TEXT NOT NULL,
        valid_to TEXT,
        market_value TEXT NOT NULL,
        CONSTRAINT valuation_valid_from_iso CHECK (valid_from GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
        CONSTRAINT valuation_valid_to_iso CHECK (valid_to GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
        CONSTRAINT valuation_end_not_before_start CHECK (valid_to >= valid_from),
        CONSTRAINT valuation_value_not_negative CHECK (market_value NOT GLOB '-*'),
        UNIQUE (property_id, valid_from)
      );

      CREATE TABLE "leases" (
        id TEXT PRIMARY KEY,
        property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
        start_date TEXT NOT NULL,
        end_date TEXT,
        monthly_rent TEXT NOT NULL,
        CONSTRAINT lease_start_date_iso CHECK (start_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
        CONSTRAINT lease_end_date_iso CHECK (end_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
        CONSTRAINT lease_end_not_before_start CHECK (end_date >= start_date),
        CONSTRAINT lease_rent_not_negative CHECK (monthly_rent NOT GLOB '-*'),
        UNIQUE (property_id, start_date)
      );

      CREATE TABLE "holding_costs" (
        id TEXT PRIMARY KEY,
        property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
        property_tax_yr TEXT,
        insurance_yr TEXT,
        mgmt_pct_rent TEXT,
        maint_pct_rent TEXT,
        svj_monthly TEXT,
        other_yr TEXT,
        UNIQUE (property_id)
      );

      CREATE TABLE "assumptions" (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        base_date TEXT NOT NULL,
        appreciation_pa TEXT NOT NULL,
        rent_indexation_pa TEXT NOT NULL,
        vacancy_allowance TEXT NOT NULL,
        post_fixation_reset_rate_pa TEXT NOT NULL,
        horizon_years INTEGER NOT NULL,
        inflation_pa TEXT NOT NULL,
        default_property_tax_yr TEXT NOT NULL,
        default_insurance_yr TEXT NOT NULL,
        default_mgmt_pct_rent TEXT NOT NULL,
        default_maint_pct_rent TEXT NOT NULL,
        default_svj_monthly TEXT NOT NULL,
        default_other_yr TEXT NOT NULL,
        CONSTRAINT assumptions_base_date_iso CHECK (base_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
        CONSTRAINT assumptions_horizon_positive CHECK (typeof(horizon_years) = 'integer' AND horizon_years > 0),
        CONSTRAINT assumptions_vacancy_0_to_1 CHECK (CAST(vacancy_allowance AS REAL) BETWEEN 0 AND 1),
        CONSTRAINT assumptions_mgmt_0_to_1 CHECK (CAST(default_mgmt_pct_rent AS REAL) BETWEEN 0 AND 1),
        CONSTRAINT assumptions_maint_0_to_1 CHECK (CAST(default_maint_pct_rent AS REAL) BETWEEN 0 AND 1)
      );

      CREATE TABLE "scenarios" (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        overrides TEXT NOT NULL,
        created_at TEXT NOT NULL,
        CONSTRAINT scenario_overrides_json CHECK (json_valid(overrides))
      );
  `,
} as const;
