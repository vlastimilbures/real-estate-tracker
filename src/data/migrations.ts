// Versioned schema migrations (SPEC §4.1 / §5). Plain SQL strings applied by the
// `migrate` runner so the EXACT same schema runs in Vitest and at app runtime — the
// Tauri plugin's Rust-side migration API is intentionally bypassed for testability.
//
// Money & rates are stored as TEXT decimal strings (e.g. '9515405.13', '0.0169')
// and round-trip losslessly through decimal.js (D(row.col) ↔ value.toString()).
// Dates are TEXT ISO 'YYYY-MM-DD'. Holding-cost columns are nullable: NULL means
// "use the Assumptions default" — the override semantics from SPEC §4.1.
//
// Safety (P5a): migrations are forward-only. Before the first pending migration of an
// existing database the runner checks integrity, runs the migration's pre-check (data
// that would break a new constraint aborts with the DB unchanged), and writes a
// verified backup; each migration then runs in ONE transaction together with its
// schema_migrations row, so it applies completely or not at all.
import type { Sql, SqlStatement } from "./sql";
import { DataError, messageOf } from "./errors";
import { parseOverrides, serializeOverrides } from "./mappers";

export interface Migration {
  version: number;
  name: string;
  sql: string;
  /** Existing data that would violate this migration (one line per record). A
   *  non-empty result aborts before anything is changed. */
  precheck?: (sql: Sql) => Promise<string[]>;
  /** Table rebuild: run with FK enforcement off; foreign_key_check must pass. */
  foreignKeysOff?: boolean;
  /** Data rewrites computed from the current rows; run after `sql`, in the same
   *  transaction. */
  build?: (sql: Sql) => Promise<SqlStatement[]>;
}

// --- v7: constraints via SQLite's table-rebuild procedure ------------------------
//
// CHECKs mirror rules the engine already enforces (validateInputs, D-37/D-38), so no
// row the app accepts today is rejected; UNIQUE keys are the natural keys the CSV
// upsert matches on. Money stays TEXT: the sign check is textual, the value check is
// the mapper guard's job (guards.ts). NULL passes every CHECK (SQL semantics), which is
// what nullable columns need.

const ISO = "'[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'";
const isoDate = (c: string) => `${c} GLOB ${ISO}`;
const nonNegative = (c: string) => `${c} NOT GLOB '-*'`;
const unitRate = (c: string) => `CAST(${c} AS REAL) BETWEEN 0 AND 1`;

interface Check {
  /** Constraint name: shows up in SQLite's "CHECK constraint failed: <name>". */
  name: string;
  expr: string;
}

interface TableSpec {
  table: string;
  /** Column definitions in the existing column order (the copy relies on it). */
  columns: string[];
  checks: Check[];
  unique: string[][];
}

const FK = "REFERENCES properties(id) ON DELETE CASCADE";

export const V7_TABLES: TableSpec[] = [
  {
    table: "properties",
    columns: [
      "id TEXT PRIMARY KEY",
      "name TEXT NOT NULL",
      "address TEXT",
      "type TEXT",
      "size_m2 INTEGER",
      "garage INTEGER",
      "purchase_date TEXT NOT NULL",
      "purchase_price TEXT NOT NULL",
      "appreciation_override_pa TEXT",
      "rent_index_override_pa TEXT",
      "active INTEGER NOT NULL DEFAULT 1",
    ],
    checks: [
      { name: "property_purchase_date_iso", expr: isoDate("purchase_date") },
      {
        name: "property_purchase_price_not_negative",
        expr: nonNegative("purchase_price"),
      },
      { name: "property_active_flag", expr: "active IN (0, 1)" },
      { name: "property_garage_flag", expr: "garage IN (0, 1)" },
    ],
    unique: [["name"]],
  },
  {
    table: "mortgage_blocks",
    columns: [
      "id TEXT PRIMARY KEY",
      `property_id TEXT NOT NULL ${FK}`,
      "start_date TEXT NOT NULL",
      "initial_principal TEXT NOT NULL",
      "fixation_years INTEGER NOT NULL",
      "interest_rate_pa TEXT NOT NULL",
      "monthly_instalment TEXT NOT NULL",
      "loan_term_years INTEGER",
      "draws TEXT",
      "interest_only_until TEXT",
      "contract_maturity_date TEXT",
    ],
    checks: [
      { name: "mortgage_start_date_iso", expr: isoDate("start_date") },
      {
        name: "mortgage_principal_not_negative",
        expr: nonNegative("initial_principal"),
      },
      {
        name: "mortgage_instalment_not_negative",
        expr: nonNegative("monthly_instalment"),
      },
      { name: "mortgage_rate_0_to_1", expr: unitRate("interest_rate_pa") },
      {
        name: "mortgage_fixation_whole_years",
        expr: "typeof(fixation_years) = 'integer' AND fixation_years >= 0",
      },
      { name: "mortgage_term_positive", expr: "loan_term_years > 0" },
      {
        name: "mortgage_interest_only_until_iso",
        expr: isoDate("interest_only_until"),
      },
      {
        name: "mortgage_contract_maturity_iso",
        expr: isoDate("contract_maturity_date"),
      },
      { name: "mortgage_draws_json", expr: "json_valid(draws)" },
    ],
    unique: [["property_id", "start_date"]],
  },
  {
    table: "valuations",
    columns: [
      "id TEXT PRIMARY KEY",
      `property_id TEXT NOT NULL ${FK}`,
      "valid_from TEXT NOT NULL",
      "valid_to TEXT",
      "market_value TEXT NOT NULL",
    ],
    checks: [
      { name: "valuation_valid_from_iso", expr: isoDate("valid_from") },
      { name: "valuation_valid_to_iso", expr: isoDate("valid_to") },
      {
        name: "valuation_end_not_before_start",
        expr: "valid_to >= valid_from",
      },
      {
        name: "valuation_value_not_negative",
        expr: nonNegative("market_value"),
      },
    ],
    unique: [["property_id", "valid_from"]],
  },
  {
    table: "leases",
    columns: [
      "id TEXT PRIMARY KEY",
      `property_id TEXT NOT NULL ${FK}`,
      "start_date TEXT NOT NULL",
      "end_date TEXT",
      "monthly_rent TEXT NOT NULL",
    ],
    checks: [
      { name: "lease_start_date_iso", expr: isoDate("start_date") },
      { name: "lease_end_date_iso", expr: isoDate("end_date") },
      { name: "lease_end_not_before_start", expr: "end_date >= start_date" },
      { name: "lease_rent_not_negative", expr: nonNegative("monthly_rent") },
    ],
    unique: [["property_id", "start_date"]],
  },
  {
    table: "holding_costs",
    columns: [
      "id TEXT PRIMARY KEY",
      `property_id TEXT NOT NULL ${FK}`,
      "property_tax_yr TEXT",
      "insurance_yr TEXT",
      "mgmt_pct_rent TEXT",
      "maint_pct_rent TEXT",
      "svj_monthly TEXT",
      "other_yr TEXT",
    ],
    checks: [],
    unique: [["property_id"]], // one row per property (DUPLICATE_HOLDING_COST, D-37)
  },
  {
    table: "assumptions",
    columns: [
      "id INTEGER PRIMARY KEY CHECK (id = 1)",
      "base_date TEXT NOT NULL",
      "appreciation_pa TEXT NOT NULL",
      "rent_indexation_pa TEXT NOT NULL",
      "vacancy_allowance TEXT NOT NULL",
      "post_fixation_reset_rate_pa TEXT NOT NULL",
      "horizon_years INTEGER NOT NULL",
      "inflation_pa TEXT NOT NULL",
      "default_property_tax_yr TEXT NOT NULL",
      "default_insurance_yr TEXT NOT NULL",
      "default_mgmt_pct_rent TEXT NOT NULL",
      "default_maint_pct_rent TEXT NOT NULL",
      "default_svj_monthly TEXT NOT NULL",
      "default_other_yr TEXT NOT NULL",
    ],
    checks: [
      { name: "assumptions_base_date_iso", expr: isoDate("base_date") },
      {
        name: "assumptions_horizon_positive",
        expr: "typeof(horizon_years) = 'integer' AND horizon_years > 0",
      },
      {
        name: "assumptions_vacancy_0_to_1",
        expr: unitRate("vacancy_allowance"),
      },
      {
        name: "assumptions_mgmt_0_to_1",
        expr: unitRate("default_mgmt_pct_rent"),
      },
      {
        name: "assumptions_maint_0_to_1",
        expr: unitRate("default_maint_pct_rent"),
      },
    ],
    unique: [],
  },
  {
    table: "scenarios",
    columns: [
      "id TEXT PRIMARY KEY",
      "name TEXT NOT NULL",
      "overrides TEXT NOT NULL",
      "created_at TEXT NOT NULL",
    ],
    checks: [
      { name: "scenario_overrides_json", expr: "json_valid(overrides)" },
    ],
    unique: [],
  },
];

const columnName = (def: string) => def.split(" ")[0];

/** SQLite's documented rebuild: create new, copy, drop old, rename new. */
function rebuildSql(spec: TableSpec): string {
  const cols = spec.columns.map(columnName).join(", ");
  const body = [
    ...spec.columns,
    ...spec.checks.map((c) => `CONSTRAINT ${c.name} CHECK (${c.expr})`),
    ...spec.unique.map((u) => `UNIQUE (${u.join(", ")})`),
  ].join(",\n        ");
  return `
      CREATE TABLE ${spec.table}_new (
        ${body}
      );
      INSERT INTO ${spec.table}_new (${cols}) SELECT ${cols} FROM ${spec.table};
      DROP TABLE ${spec.table};
      ALTER TABLE ${spec.table}_new RENAME TO ${spec.table};
  `;
}

/** Records that would violate the v7 constraints, named by id (and property name). */
export async function v7Conflicts(sql: Sql): Promise<string[]> {
  const names = new Map(
    (
      await sql.select<{ id: string; name: string }>(
        "SELECT id, name FROM properties",
      )
    ).map((r) => [r.id, r.name]),
  );
  const who = (table: string, id: string, propertyId?: string | null) =>
    table === "properties"
      ? `property "${names.get(id) ?? id}"`
      : propertyId != null
        ? `${table} ${id} (property "${names.get(propertyId) ?? propertyId}")`
        : `${table} ${id}`;
  const out: string[] = [];
  for (const spec of V7_TABLES) {
    const hasProperty = spec.columns.some((c) => c.startsWith("property_id "));
    const pid = hasProperty ? "property_id" : "NULL AS property_id";
    for (const check of spec.checks) {
      const rows = await sql.select<{ id: string; property_id: string | null }>(
        `SELECT id, ${pid} FROM ${spec.table} WHERE NOT (${check.expr}) ORDER BY id`,
      );
      for (const r of rows)
        out.push(
          `${who(spec.table, String(r.id), r.property_id)}: ${check.name}`,
        );
    }
    for (const key of spec.unique) {
      const rows = await sql.select<{ ids: string }>(
        `SELECT group_concat(id, ', ') AS ids FROM ${spec.table}
         GROUP BY ${key.join(", ")} HAVING COUNT(*) > 1 ORDER BY ids`,
      );
      for (const r of rows) {
        const ids = r.ids.split(", ");
        const label =
          spec.table === "properties"
            ? `properties ${ids.map((i) => `"${names.get(i) ?? i}"`).join(", ")}`
            : `${spec.table} ${r.ids}`;
        out.push(`${label}: duplicate ${key.join(" + ")}`);
      }
    }
  }
  const orphans = await sql.select<{ table: string; rowid: number }>(
    "PRAGMA foreign_key_check",
  );
  for (const o of orphans) {
    const [row] = await sql.select<{ id: string; property_id: string }>(
      `SELECT id, property_id FROM ${o.table} WHERE rowid = ?`,
      [o.rowid],
    );
    out.push(
      `${row ? who(o.table, String(row.id), row.property_id) : `${o.table} row ${o.rowid}`}: refers to a missing property`,
    );
  }
  return out;
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "initial schema",
    sql: `
      CREATE TABLE properties (
        id                       TEXT PRIMARY KEY,
        name                     TEXT NOT NULL,
        address                  TEXT,
        type                     TEXT,
        size_m2                  INTEGER,
        garage                   INTEGER,                 -- 0/1
        purchase_date            TEXT NOT NULL,           -- ISO yyyy-mm-dd
        purchase_price           TEXT NOT NULL,           -- decimal string
        appreciation_override_pa TEXT,                    -- decimal string, nullable
        rent_index_override_pa   TEXT
      );

      CREATE TABLE mortgage_blocks (
        id                 TEXT PRIMARY KEY,
        property_id        TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
        start_date         TEXT NOT NULL,
        initial_principal  TEXT NOT NULL,
        fixation_years     INTEGER NOT NULL,
        interest_rate_pa   TEXT NOT NULL,
        monthly_instalment TEXT NOT NULL
      );

      CREATE TABLE valuations (
        id           TEXT PRIMARY KEY,
        property_id  TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
        valid_from   TEXT NOT NULL,
        valid_to     TEXT,                                -- nullable: open-ended
        market_value TEXT NOT NULL
      );

      CREATE TABLE leases (
        id           TEXT PRIMARY KEY,
        property_id  TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
        start_date   TEXT NOT NULL,
        end_date     TEXT,                                -- nullable: current lease
        monthly_rent TEXT NOT NULL
      );

      CREATE TABLE holding_costs (
        id              TEXT PRIMARY KEY,
        property_id     TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
        property_tax_yr TEXT,                             -- all nullable: NULL ⇒ default
        insurance_yr    TEXT,
        mgmt_pct_rent   TEXT,
        maint_pct_rent  TEXT,
        svj_monthly     TEXT,
        other_yr        TEXT
      );

      CREATE TABLE assumptions (
        id                          INTEGER PRIMARY KEY CHECK (id = 1),  -- single row
        base_date                   TEXT NOT NULL,
        appreciation_pa             TEXT NOT NULL,
        rent_indexation_pa          TEXT NOT NULL,
        vacancy_allowance           TEXT NOT NULL,
        post_fixation_reset_rate_pa TEXT NOT NULL,
        horizon_years               INTEGER NOT NULL,
        inflation_pa                TEXT NOT NULL,
        default_property_tax_yr     TEXT NOT NULL,
        default_insurance_yr        TEXT NOT NULL,
        default_mgmt_pct_rent       TEXT NOT NULL,
        default_maint_pct_rent      TEXT NOT NULL,
        default_svj_monthly         TEXT NOT NULL,
        default_other_yr            TEXT NOT NULL
      );

      CREATE TABLE scenarios (
        id         TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        overrides  TEXT NOT NULL,                         -- JSON assumption overrides
        created_at TEXT NOT NULL
      );
    `,
  },
  {
    version: 2,
    name: "mortgage loan term",
    // Optional explicit amortization term. NULL ⇒ derive the term from the
    // instalment via NPER (legacy behaviour); a value pins it (default 30 yrs).
    sql: `
      ALTER TABLE mortgage_blocks ADD COLUMN loan_term_years INTEGER;
    `,
  },
  {
    version: 3,
    name: "mortgage development draws + interest-only",
    // Gradual utilization for properties under development. `draws` is a JSON array
    // of {date, amount(decimal string)} tranches, or NULL for a plain single-draw
    // loan. `interest_only_until` is an ISO date; while set the borrower pays
    // interest only until that completion date. Both NULL ⇒ legacy loan, byte-
    // identical schedule (the parity gate).
    sql: `
      ALTER TABLE mortgage_blocks ADD COLUMN draws TEXT;
      ALTER TABLE mortgage_blocks ADD COLUMN interest_only_until TEXT;
    `,
  },
  {
    version: 4,
    name: "property active flag",
    // 0 ⇒ deactivated: the property is retained (with all its mortgages, leases,
    // valuations) but excluded from portfolio aggregates and projections. Existing
    // rows default to active (1), so the parity numbers are unchanged.
    sql: `
      ALTER TABLE properties ADD COLUMN active INTEGER NOT NULL DEFAULT 1;
    `,
  },
  {
    version: 5,
    name: "app meta (first-run seed flag)",
    // Key/value app state that is NOT portfolio data (never backed up or restored).
    // `sample_seeded` records that the first-run sample portfolio was offered, so an
    // emptied portfolio stays empty (D-16, DR-024). A DB that already has an
    // assumptions row or properties has launched before ⇒ counts as seeded. Both
    // statements are idempotent, so a half-applied run re-applies cleanly.
    sql: `
      CREATE TABLE IF NOT EXISTS app_meta (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      INSERT OR IGNORE INTO app_meta (key, value)
        SELECT 'sample_seeded', '1'
        WHERE EXISTS (SELECT 1 FROM assumptions) OR EXISTS (SELECT 1 FROM properties);
    `,
  },
  {
    version: 6,
    name: "mortgage contract maturity date",
    // Optional contract maturity (ISO date), checked against the instalment-implied
    // maturity (D-29). Informational only: the term stays derived from the
    // instalment (D-08). Existing rows get NULL — needs owner input, never guessed.
    sql: `
      ALTER TABLE mortgage_blocks ADD COLUMN contract_maturity_date TEXT;
    `,
  },
  {
    version: 7,
    name: "constraints (unique natural keys, checks)",
    // Rebuilds every portfolio table with the V7_TABLES constraints (P5a). Children
    // are rebuilt before their parent is dropped; FK enforcement is off for the
    // transaction (dropping `properties` would otherwise cascade-delete every child)
    // and foreign_key_check must pass before it commits.
    sql: V7_TABLES.map(rebuildSql).join("\n"),
    precheck: v7Conflicts,
    foreignKeysOff: true,
  },
  {
    version: 8,
    name: "versioned scenario overrides JSON",
    // DR-037: rewrite every stored overrides JSON to the versioned shape (`version: 1`;
    // the legacy flat `valueShockPct` becomes `valueShock {pct, atYear: 0}`). Same
    // meaning, new spelling. Unreadable JSON aborts in the pre-check, before any change.
    sql: "",
    precheck: async (sql) => {
      const out: string[] = [];
      for (const r of await scenarioRows(sql)) {
        try {
          parseOverrides(r.name, r.overrides);
        } catch (e) {
          out.push(...(e instanceof DataError ? e.details : [messageOf(e)]));
        }
      }
      return out;
    },
    build: async (sql) =>
      (await scenarioRows(sql))
        .map((r) => ({
          id: r.id,
          before: r.overrides,
          after: serializeOverrides(parseOverrides(r.name, r.overrides)),
        }))
        .filter((r) => r.after !== r.before)
        .map((r) => ({
          query: "UPDATE scenarios SET overrides = ? WHERE id = ?",
          params: [r.after, r.id],
        })),
  },
  {
    version: 9,
    name: "mortgage prepayments and recasts",
    // ADR 0109: nullable JSON lists, like `draws` (v3). `prepayments` holds
    // [{date, amount, effect, fee?}], `recasts` holds [{date, maturity} | {date,
    // instalment}]. NULL = none, so every stored loan keeps its numbers. Each column
    // carries its JSON check here: V7_TABLES is the frozen v7 rebuild spec.
    sql: `
      ALTER TABLE mortgage_blocks ADD COLUMN prepayments TEXT
        CONSTRAINT mortgage_prepayments_json CHECK (json_valid(prepayments));
      ALTER TABLE mortgage_blocks ADD COLUMN recasts TEXT
        CONSTRAINT mortgage_recasts_json CHECK (json_valid(recasts));
    `,
  },
];

function scenarioRows(
  sql: Sql,
): Promise<{ id: string; name: string; overrides: string }[]> {
  return sql.select("SELECT id, name, overrides FROM scenarios ORDER BY id");
}

/** A migration's SQL as ONE statement text: every adapter runs a multi-statement
 *  text whole inside the transaction (DR-084), so tests and the app run the same DDL. */
function migrationText(text: string): SqlStatement[] {
  return text.trim() ? [{ query: text }] : [];
}

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

/**
 * Apply every migration whose version is newer than what's recorded, in order.
 * Idempotent: re-running is a no-op once all versions are present. For an existing
 * database, nothing is migrated without a verified backup (P5a).
 */
export async function migrate(
  sql: Sql,
  { now = () => new Date() }: MigrateOptions = {},
): Promise<MigrateResult> {
  await sql.execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);
  await checkIntegrity(sql);
  const applied = await sql.select<{ version: number }>(
    "SELECT version FROM schema_migrations",
  );
  const done = new Set(applied.map((r) => Number(r.version)));
  const from = done.size === 0 ? 0 : Math.max(...done);
  const head = Math.max(...MIGRATIONS.map((m) => m.version));
  if (from > head) {
    throw new DataError(
      "DB_NEWER",
      "This database was saved by a newer version of the app. Nothing was changed.",
      [`database v${from}, this app v${head}`],
    );
  }
  const pending = [...MIGRATIONS]
    .sort((a, b) => a.version - b.version)
    .filter((m) => !done.has(m.version));
  const last = pending.at(-1);
  if (last === undefined) return { from, to: from, backupPath: null };
  const to = last.version;

  let backupPath: string | null = null;
  for (const m of pending) {
    const conflicts = m.precheck ? await m.precheck(sql) : [];
    if (conflicts.length > 0) {
      throw new DataError(
        "MIGRATION_CONFLICT",
        `Database upgrade to v${m.version} stopped: ${conflicts.length} record(s) conflict with the new rules. Nothing was changed.`,
        conflicts,
      );
    }
    if (done.size > 0 && backupPath === null) {
      try {
        backupPath = await sql.backup(
          `pre-migration-v${from}-to-v${to}-${stamp(now())}`,
        );
      } catch (e) {
        throw new DataError(
          "MIGRATION_BACKUP_FAILED",
          "Database upgrade stopped: the safety backup could not be written or verified. Nothing was changed.",
          [messageOf(e)],
          { cause: e },
        );
      }
    }
    try {
      await sql.transaction(
        [
          ...migrationText(m.sql),
          ...(m.build ? await m.build(sql) : []),
          {
            query:
              "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)",
            params: [m.version, m.name, now().toISOString()],
          },
        ],
        { foreignKeysOff: m.foreignKeysOff ?? false },
      );
    } catch (e) {
      throw new DataError(
        "MIGRATION_FAILED",
        `Database upgrade to v${m.version} failed and was rolled back.`,
        [messageOf(e)],
        { cause: e },
      );
    }
  }
  return { from, to, backupPath };
}
