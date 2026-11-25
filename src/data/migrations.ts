// Versioned schema migrations (SPEC §4.1 / §5). Plain SQL strings applied by the
// `migrate` runner so the EXACT same schema runs in Vitest and at app runtime — the
// Tauri plugin's Rust-side migration API is intentionally bypassed for testability.
//
// Money & rates are stored as TEXT decimal strings (e.g. '9515405.13', '0.0169')
// and round-trip losslessly through decimal.js (D(row.col) ↔ value.toString()).
// Dates are TEXT ISO 'YYYY-MM-DD'. Holding-cost columns are nullable: NULL means
// "use the Assumptions default" — the override semantics from SPEC §4.1.
//
// The schema starts at version 8 (ADR 0230): a new database gets the version 8 tables in
// one step (`BASELINE`), then steps 9 onwards; a database at version 8 or later upgrades
// step by step; an older one is refused before anything is written.
//
// Safety (P5a): migrations are forward-only. Before the first pending step of an existing
// database the runner checks integrity and writes a verified backup; each step then runs
// in ONE transaction together with its schema_migrations row, so it applies completely or
// not at all.
import type { Sql, SqlStatement } from "./sql";
import { DataError, messageOf, type UpgradeStop } from "./errors";

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

const nonNegative = (c: string) => `${c} NOT GLOB '-*'`;
const unitRate = (c: string) => `CAST(${c} AS REAL) BETWEEN 0 AND 1`;

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

/** The steps after the baseline, in order. */
export const MIGRATIONS: Migration[] = [
  {
    version: 9,
    name: "mortgage prepayments and recasts",
    // ADR 0109: nullable JSON lists, like `draws`. `prepayments` holds [{date, amount,
    // effect, fee?}], `recasts` holds [{date, maturity} | {date, instalment}]. NULL = none,
    // so every stored loan keeps its numbers. Each column carries its JSON check.
    sql: `
      ALTER TABLE mortgage_blocks ADD COLUMN prepayments TEXT
        CONSTRAINT mortgage_prepayments_json CHECK (json_valid(prepayments));
      ALTER TABLE mortgage_blocks ADD COLUMN recasts TEXT
        CONSTRAINT mortgage_recasts_json CHECK (json_valid(recasts));
    `,
  },
  {
    version: 10,
    name: "property acquisition funding",
    // ADR 0119: the owner's funding record, every part nullable. NULL = unknown (never
    // backfilled), so every stored property keeps its numbers. Money as TEXT with the
    // textual sign check of the baseline's money columns.
    sql: `
      ALTER TABLE properties ADD COLUMN own_cash TEXT
        CONSTRAINT property_own_cash_not_negative CHECK (${nonNegative("own_cash")});
      ALTER TABLE properties ADD COLUMN transaction_costs TEXT
        CONSTRAINT property_transaction_costs_not_negative CHECK (${nonNegative("transaction_costs")});
      ALTER TABLE properties ADD COLUMN initial_works TEXT
        CONSTRAINT property_initial_works_not_negative CHECK (${nonNegative("initial_works")});
      ALTER TABLE properties ADD COLUMN funding_note TEXT;
    `,
  },
  {
    version: 11,
    name: "assumptions selling costs",
    // ADR 0183: the selling-cost rate of a sale at the horizon (levered IRR only). NOT NULL
    // like every assumptions column; DEFAULT '0' fills the one existing row, so the
    // owner's numbers do not change. A rate as TEXT with the 0–1 check of the baseline's
    // rates.
    sql: `
      ALTER TABLE assumptions ADD COLUMN selling_cost_pct TEXT NOT NULL DEFAULT '0' CONSTRAINT assumptions_selling_cost_0_to_1 CHECK (${unitRate("selling_cost_pct")});
    `,
  },
];

/** The newest schema this app writes and reads (the last migration). */
export const SCHEMA_HEAD = Math.max(...MIGRATIONS.map((m) => m.version));

/** Created by the baseline step, in its transaction: the text every database has had
 *  since version 1. */
const SCHEMA_MIGRATIONS_DDL = `
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `;

const RECORD_STEP =
  "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)";

/** A migration's SQL as ONE statement text: every adapter runs a multi-statement
 *  text whole inside the transaction (DR-084), so tests and the app run the same DDL. */
function migrationText(text: string): SqlStatement[] {
  return text.trim() ? [{ query: text }] : [];
}

/** One transaction of an upgrade: the version it reaches and its statements, built with
 *  the `applied_at` stamp when it runs. */
interface Step {
  version: number;
  statements: (appliedAt: string) => SqlStatement[];
}

/** A new database: schema_migrations, the version 8 tables and rows 1–8, all at once. */
const BASELINE_STEP: Step = {
  version: BASELINE.version,
  statements: (appliedAt) => [
    { query: SCHEMA_MIGRATIONS_DDL },
    { query: BASELINE.sql },
    ...BASELINE.steps.map((s) => ({
      query: RECORD_STEP,
      params: [s.version, s.name, appliedAt],
    })),
  ],
};

const migrationStep = (m: Migration): Step => ({
  version: m.version,
  statements: (appliedAt) => [
    ...migrationText(m.sql),
    { query: RECORD_STEP, params: [m.version, m.name, appliedAt] },
  ],
});

/** Compact UTC stamp for backup file names: 20261001T073512Z. */
export function stamp(d: Date): string {
  return d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "Z");
}

export interface MigrateOptions {
  /** Clock for the backup file name and `applied_at` (tests pin it). */
  now?: () => Date;
}

export interface MigrateResult {
  from: number;
  to: number;
  /** Where the pre-migration backup went; null when nothing was pending, or for a
   *  brand-new database (nothing to protect). */
  backupPath: string | null;
}

/** What a stopped upgrade left behind, for the log-side message (the screen builds its
 *  own text from `DataError.upgrade`). */
function outcome(u: UpgradeStop): string {
  if (u.reached === u.from) return "Nothing was changed.";
  const copy = u.backupPath ?? "none (new database)";
  return `The database was upgraded to v${u.reached}; pre-upgrade copy: ${copy}.`;
}

/** `PRAGMA integrity_check` must answer exactly "ok". */
export async function checkIntegrity(sql: Sql): Promise<void> {
  const rows = await sql.select<{ integrity_check: string }>(
    "PRAGMA integrity_check",
  );
  const problems = rows.map((r) => String(r.integrity_check));
  if (problems.length !== 1 || problems[0] !== "ok") {
    throw new DataError(
      "DB_INTEGRITY",
      "The database file is damaged (integrity check failed).",
      problems,
    );
  }
}

/** The recorded versions, read without writing anything: none for a new database. */
async function appliedVersions(sql: Sql): Promise<Set<number>> {
  const table = await sql.select(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'",
  );
  if (table.length === 0) return new Set();
  const rows = await sql.select<{ version: number }>(
    "SELECT version FROM schema_migrations",
  );
  return new Set(rows.map((r) => Number(r.version)));
}

/** A database this app cannot upgrade is refused before anything is written: newer than
 *  head (DR-022), or older than the baseline (ADR 0230). */
function refuseUnsupported(from: number): void {
  if (from > SCHEMA_HEAD) {
    throw new DataError(
      "DB_NEWER",
      "This database was saved by a newer version of the app. Nothing was changed.",
      [`database v${from}, this app v${SCHEMA_HEAD}`],
    );
  }
  if (from > 0 && from < BASELINE.version) {
    throw new DataError(
      "DB_TOO_OLD",
      `This database is at v${from}; this app upgrades v${BASELINE.version} and later (ADR 0230). Nothing was changed.`,
    );
  }
}

/** The steps a database with the recorded versions `done` still needs, in order. */
function pendingSteps(done: ReadonlySet<number>): Step[] {
  if (done.size === 0) return [BASELINE_STEP, ...MIGRATIONS.map(migrationStep)];
  return [...MIGRATIONS]
    .sort((a, b) => a.version - b.version)
    .filter((m) => !done.has(m.version))
    .map(migrationStep);
}

/** The verified pre-upgrade copy, written once before the first commit, so a failure
 *  here always means nothing changed. */
async function safetyCopy(sql: Sql, label: string): Promise<string> {
  try {
    return await sql.backup(label);
  } catch (e) {
    throw new DataError(
      "MIGRATION_BACKUP_FAILED",
      "Database upgrade stopped: the safety backup could not be written or verified. Nothing was changed.",
      [messageOf(e)],
      { cause: e },
    );
  }
}

/**
 * Apply every step whose version is newer than what's recorded, in order. Idempotent:
 * re-running is a no-op once all versions are present. For an existing database, nothing
 * is migrated without a verified backup (P5a); one below the baseline or above head is
 * refused unchanged.
 */
export async function migrate(
  sql: Sql,
  { now = () => new Date() }: MigrateOptions = {},
): Promise<MigrateResult> {
  await checkIntegrity(sql);
  const done = await appliedVersions(sql);
  const from = done.size === 0 ? 0 : Math.max(...done);
  refuseUnsupported(from);
  const pending = pendingSteps(done);
  const last = pending.at(-1);
  if (last === undefined) return { from, to: from, backupPath: null };
  const to = last.version;
  const backupPath =
    done.size > 0
      ? await safetyCopy(
          sql,
          `pre-migration-v${from}-to-v${to}-${stamp(now())}`,
        )
      : null;
  // The last committed version: a later step can stop after earlier ones committed
  // (ADR 0153), so the error says how far the upgrade got.
  let reached = from;
  for (const step of pending) {
    try {
      await sql.transaction(step.statements(now().toISOString()));
    } catch (e) {
      const upgrade = { from, reached, stoppedAt: step.version, backupPath };
      throw new DataError(
        "MIGRATION_FAILED",
        `Database upgrade to v${step.version} failed and was rolled back. ${outcome(upgrade)}`,
        [messageOf(e)],
        { cause: e, upgrade },
      );
    }
    reached = step.version;
  }
  return { from, to, backupPath };
}
