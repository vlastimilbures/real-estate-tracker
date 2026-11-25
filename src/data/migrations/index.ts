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
// one step (`BASELINE`, the frozen DDL in baseline.ts), then steps 9 onwards (steps.ts);
// a database at version 8 or later upgrades step by step; an older one is refused before
// anything is written.
//
// Safety (P5a): migrations are forward-only. Before the first pending step of an existing
// database the runner checks integrity and writes a verified backup; each step then runs
// in ONE transaction together with its schema_migrations row, so it applies completely or
// not at all.
import type { Sql, SqlStatement } from "../sql";
import { DataError, messageOf, type UpgradeStop } from "../errors";
import { BASELINE } from "./baseline";
import { MIGRATIONS, type Migration } from "./steps";

/**
 * The baseline and the steps, kept on this path for the migration tests and the Rust
 * fixture test, which import them from here unchanged (#472).
 * @internal
 */
export { BASELINE, MIGRATIONS };

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
