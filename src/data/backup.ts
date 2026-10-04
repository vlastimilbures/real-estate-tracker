// Whole-database export/import for Backup & Restore, plus the Tauri file-dialog /
// filesystem orchestration around it. No React — the UI page only drives state/toasts
// off the results below.
//
// P5b: a backup carries the database schema version (DR-038). A restore checks the
// WHOLE file first — version, shape, every row, the engine's input rules — upgrades an
// older file in memory, writes and verifies a safety backup, and only then replaces the
// data in one transaction (D-14): on any failure the current data stays (DR-019).
import { invoke } from "@tauri-apps/api/core";
import type { Sql, SqlStatement } from "./sql";
import { PORTFOLIO_TABLES, insertStatement } from "./repositories";
import { MIGRATIONS, V7_TABLES, stamp } from "./migrations";
import { DataError, messageOf } from "./errors";
import {
  SaveFileError,
  type SaveFileOptions,
  type SaveOutcome,
} from "../platform/saveFileTypes";
import {
  parseOverrides,
  rowToAssumptions,
  rowToHoldingCost,
  rowToLease,
  rowToMortgageBlock,
  rowToProperty,
  rowToScenario,
  rowToValuation,
  serializeOverrides,
  type AssumptionsRow,
  type HoldingCostRow,
  type LeaseRow,
  type MortgageBlockRow,
  type PropertyRow,
  type ScenarioRow,
  type ValuationRow,
} from "./mappers";
import type {
  Assumptions,
  EngineValidationError,
  Portfolio,
  ValidationCode,
  ValidationEntity,
} from "../engine";
import type { IntRange } from "../lib/intRanges";

/** A whole-number field outside the bounds the forms and CSV import apply (ADR 0086).
 *  Restore-only: the engine itself is open-ended. */
export interface RangeProblem {
  code: "OUT_OF_RANGE";
  entity: ValidationEntity;
  id?: string | undefined;
  field: string;
  range: IntRange;
}

/** The engine's input rules plus the whole-number bounds over the restored rows
 *  (assumptions absent ⇒ portfolio rules only). Injected by the caller: the data layer
 *  never calls engine functions; `checkInputRules` in src/import/inputRules.ts is the one
 *  the app uses. */
export type InputRules = (
  portfolio: Portfolio,
  assumptions?: Assumptions,
) => (EngineValidationError | RangeProblem)[];

/** The newest schema this app writes and reads (the last migration). */
export const SCHEMA_HEAD = Math.max(...MIGRATIONS.map((m) => m.version));

/** D-53: a backup file larger than this is refused before it is parsed. */
export const BACKUP_MAX_BYTES = 20 * 1024 * 1024;

export interface BackupFile {
  /** The database schema version the file was written at (1 in every file written
   *  before P5b, whatever the database version was). */
  schemaVersion: number;
  exportedAt: string;
  tables: Record<string, Record<string, unknown>[]>;
}

const BACKUP_TABLES = [
  ...PORTFOLIO_TABLES,
  "assumptions",
  "scenarios",
] as const;

type BackupTable = (typeof BACKUP_TABLES)[number];

/** The columns a restore may write, per table (current schema). Restore refuses any
 *  other key: backup keys become SQL identifiers, so they must never come from the file
 *  unchecked (DR-017). A drift test pins this to the migrated schema. */
export const BACKUP_COLUMNS: Record<BackupTable, readonly string[]> = {
  properties: [
    "id",
    "name",
    "address",
    "type",
    "size_m2",
    "garage",
    "purchase_date",
    "purchase_price",
    "appreciation_override_pa",
    "rent_index_override_pa",
    "active",
    "own_cash",
    "transaction_costs",
    "initial_works",
    "funding_note",
  ],
  mortgage_blocks: [
    "id",
    "property_id",
    "start_date",
    "initial_principal",
    "fixation_years",
    "interest_rate_pa",
    "monthly_instalment",
    "loan_term_years",
    "draws",
    "interest_only_until",
    "contract_maturity_date",
    "prepayments",
    "recasts",
  ],
  valuations: ["id", "property_id", "valid_from", "valid_to", "market_value"],
  leases: ["id", "property_id", "start_date", "end_date", "monthly_rent"],
  holding_costs: [
    "id",
    "property_id",
    "property_tax_yr",
    "insurance_yr",
    "mgmt_pct_rent",
    "maint_pct_rent",
    "svj_monthly",
    "other_yr",
  ],
  assumptions: [
    "id",
    "base_date",
    "appreciation_pa",
    "rent_indexation_pa",
    "vacancy_allowance",
    "post_fixation_reset_rate_pa",
    "horizon_years",
    "inflation_pa",
    "default_property_tax_yr",
    "default_insurance_yr",
    "default_mgmt_pct_rent",
    "default_maint_pct_rent",
    "default_svj_monthly",
    "default_other_yr",
  ],
  scenarios: ["id", "name", "overrides", "created_at"],
};

/** Value for a column an older backup lacks: every column added by a later migration
 *  is nullable, except `properties.active` (v4, default 1). */
const ADDED_COLUMN_DEFAULTS: Partial<Record<string, unknown>> = {
  "properties.active": 1,
};

// --- errors ---------------------------------------------------------------------

export type RestoreErrorCode =
  /** Larger than BACKUP_MAX_BYTES (D-53). */
  | "BACKUP_TOO_LARGE"
  /** Not JSON at all. */
  | "BACKUP_NOT_JSON"
  /** Not a backup: wrong shape, missing table, unknown column, non-scalar cell. */
  | "BACKUP_INVALID"
  /** Written by a newer app version. */
  | "BACKUP_NEWER"
  /** Rows that the app cannot read or that break its rules; see `issues`. */
  | "BACKUP_ROWS_INVALID";

/** One offending row. Never carries a value — table, id, column and rule only. */
export interface RestoreIssue {
  table: string;
  id?: string;
  column?: string;
  rule:
    | ValidationCode
    | "UNREADABLE_VALUE"
    | "DUPLICATE_KEY"
    | "MISSING_ASSUMPTIONS"
    | "OUT_OF_RANGE";
  /** The allowed range of an OUT_OF_RANGE field. */
  range?: IntRange;
}

/** The backup was refused before anything was changed. */
export class RestoreError extends Error {
  readonly code: RestoreErrorCode;
  readonly issues: RestoreIssue[];
  /** BACKUP_INVALID: what is wrong · BACKUP_NEWER: "v<file> > v<app>". */
  readonly detail: string;
  constructor(
    code: RestoreErrorCode,
    message: string,
    {
      issues = [],
      detail = "",
    }: { issues?: RestoreIssue[]; detail?: string } = {},
  ) {
    super(message);
    this.name = "RestoreError";
    this.code = code;
    this.issues = issues;
    this.detail = detail;
  }
}

const invalid = (detail: string) =>
  new RestoreError(
    "BACKUP_INVALID",
    `Invalid backup: ${detail} — restore aborted`,
    {
      detail,
    },
  );

// --- export ---------------------------------------------------------------------

async function schemaVersionOf(sql: Sql): Promise<number> {
  const rows = await sql.select<{ v: number | null }>(
    "SELECT MAX(version) AS v FROM schema_migrations",
  );
  return Number(rows[0]?.v ?? SCHEMA_HEAD);
}

export async function exportToJson(sql: Sql): Promise<BackupFile> {
  const tables: Record<string, Record<string, unknown>[]> = {};
  for (const table of BACKUP_TABLES) {
    tables[table] = await sql.select(`SELECT * FROM ${table}`);
  }
  return {
    schemaVersion: await schemaVersionOf(sql),
    exportedAt: new Date().toISOString(),
    tables,
  };
}

// --- reading a backup -----------------------------------------------------------

/** The D-53 size rejection (also raised by Rust before reading a picked file). */
function backupTooLarge(): RestoreError {
  return new RestoreError(
    "BACKUP_TOO_LARGE",
    `The backup file is larger than ${BACKUP_MAX_BYTES / (1024 * 1024)} MB.`,
  );
}

/** Size check (D-53), JSON parse and shape check of a backup file's text. */
export function parseBackupText(text: string): BackupFile {
  if (new TextEncoder().encode(text).length > BACKUP_MAX_BYTES)
    throw backupTooLarge();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new RestoreError("BACKUP_NOT_JSON", "The file is not a JSON backup.");
  }
  return validateBackup(data);
}

/** The backup's top-level shape and version. Rows are checked by `prepareRestore`. */
export function validateBackup(data: unknown): BackupFile {
  if (typeof data !== "object" || data === null || Array.isArray(data))
    throw invalid("expected a JSON object");
  const b = data as Record<string, unknown>;
  if (typeof b.schemaVersion !== "number" || !Number.isInteger(b.schemaVersion))
    throw invalid("missing schemaVersion");
  if (b.schemaVersion > SCHEMA_HEAD)
    throw new RestoreError(
      "BACKUP_NEWER",
      `Unsupported schema version ${b.schemaVersion} (this app reads up to ${SCHEMA_HEAD}).`,
      { detail: `v${b.schemaVersion} > v${SCHEMA_HEAD}` },
    );
  if (b.schemaVersion < 1) throw invalid("missing schemaVersion");
  if (typeof b.exportedAt !== "string") throw invalid("missing exportedAt");
  if (typeof b.tables !== "object" || b.tables === null)
    throw invalid("missing tables");
  return b as unknown as BackupFile;
}

/** What the confirm step shows: when the file was written and how many rows it holds. */
export interface BackupSummary {
  exportedAt: string;
  schemaVersion: number;
  counts: Record<BackupTable, number>;
}

function summarise(backup: BackupFile): BackupSummary {
  const counts = {} as Record<BackupTable, number>;
  for (const t of BACKUP_TABLES) counts[t] = backup.tables[t]?.length ?? 0;
  return {
    exportedAt: backup.exportedAt,
    schemaVersion: backup.schemaVersion,
    counts,
  };
}

// --- checking every row ---------------------------------------------------------

type Row = Record<string, unknown>;
type Tables = Record<BackupTable, Row[]>;

/** Every table present, only known columns, scalar cells (DR-017); then each row
 *  brought to the current schema: missing added columns get their default and
 *  scenario overrides are rewritten to the versioned shape (what migration v8 does). */
function upgradeRows(backup: BackupFile): {
  tables: Tables;
  issues: RestoreIssue[];
} {
  const tables = {} as Tables;
  const issues: RestoreIssue[] = [];
  for (const table of BACKUP_TABLES) {
    const rows: unknown = backup.tables?.[table];
    if (!Array.isArray(rows))
      throw invalid(`missing or invalid table "${table}"`);
    const allowed = BACKUP_COLUMNS[table];
    tables[table] = rows.map((row: unknown) => {
      if (typeof row !== "object" || row === null || Array.isArray(row))
        throw invalid(`invalid row in table "${table}"`);
      for (const [col, value] of Object.entries(row)) {
        if (!allowed.includes(col))
          throw invalid(`unknown column "${col}" in table "${table}"`);
        if (
          value !== null &&
          typeof value !== "string" &&
          typeof value !== "number"
        )
          throw invalid(`invalid value in column "${col}" of table "${table}"`);
      }
      const r = row as Row;
      return Object.fromEntries(
        allowed.map((c) => [
          c,
          c in r ? r[c] : (ADDED_COLUMN_DEFAULTS[`${table}.${c}`] ?? null),
        ]),
      );
    });
  }
  for (const s of tables.scenarios) {
    try {
      s.overrides = serializeOverrides(
        parseOverrides(String(s.name), String(s.overrides)),
      );
    } catch {
      issues.push({
        table: "scenarios",
        id: String(s.id),
        column: "overrides",
        rule: "UNREADABLE_VALUE",
      });
    }
  }
  return { tables, issues };
}

/** Map rows through the DB-boundary guards; an unreadable row becomes an issue. */
function readRows<R, T>(
  table: BackupTable,
  rows: Row[],
  map: (r: R) => T,
  issues: RestoreIssue[],
): T[] {
  const out: T[] = [];
  for (const r of rows) {
    try {
      out.push(map(r as R));
    } catch (e) {
      if (!(e instanceof DataError)) throw e;
      issues.push({ table, id: String(r.id), rule: "UNREADABLE_VALUE" });
    }
  }
  return out;
}

const ENTITY_TABLE: Record<ValidationEntity, BackupTable> = {
  assumptions: "assumptions",
  property: "properties",
  mortgage: "mortgage_blocks",
  valuation: "valuations",
  lease: "leases",
  holdingCost: "holding_costs",
};

const snake = (field: string) =>
  field.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/** Rows repeating an earlier row's id or natural key (the v7 UNIQUE keys). */
function duplicateKeys(tables: Tables): RestoreIssue[] {
  const issues: RestoreIssue[] = [];
  for (const table of BACKUP_TABLES) {
    const spec = V7_TABLES.find((s) => s.table === table);
    for (const key of [["id"], ...(spec?.unique ?? [])]) {
      const seen = new Set<string>();
      for (const r of tables[table]) {
        const k = JSON.stringify(key.map((c) => r[c]));
        if (seen.has(k))
          issues.push({
            table,
            id: String(r.id),
            column: key.join(", "),
            rule: "DUPLICATE_KEY",
          });
        seen.add(k);
      }
    }
  }
  return issues;
}

export interface PreparedRestore {
  summary: BackupSummary;
  /** Wipe (children first) and re-insert, for one transaction. */
  statements: SqlStatement[];
}

/**
 * Check every row of `backup` and build the replacement statements. Throws a
 * RestoreError and touches nothing when the file cannot be restored as a whole.
 */
export function prepareRestore(
  backup: BackupFile,
  rules: InputRules,
): PreparedRestore {
  validateBackup(backup);
  const { tables, issues } = upgradeRows(backup);

  const portfolio: Portfolio = {
    properties: readRows<PropertyRow, Portfolio["properties"][number]>(
      "properties",
      tables.properties,
      rowToProperty,
      issues,
    ),
    mortgages: readRows<MortgageBlockRow, Portfolio["mortgages"][number]>(
      "mortgage_blocks",
      tables.mortgage_blocks,
      rowToMortgageBlock,
      issues,
    ),
    valuations: readRows<ValuationRow, Portfolio["valuations"][number]>(
      "valuations",
      tables.valuations,
      rowToValuation,
      issues,
    ),
    leases: readRows<LeaseRow, Portfolio["leases"][number]>(
      "leases",
      tables.leases,
      rowToLease,
      issues,
    ),
    holdingCosts: readRows<HoldingCostRow, Portfolio["holdingCosts"][number]>(
      "holding_costs",
      tables.holding_costs,
      rowToHoldingCost,
      issues,
    ),
  };
  readRows<ScenarioRow, unknown>(
    "scenarios",
    tables.scenarios,
    rowToScenario,
    [],
  );
  const assumptionRows = tables.assumptions;
  const [onlyAssumptions] = assumptionRows;
  const singleAssumptions =
    assumptionRows.length === 1 && Number(onlyAssumptions?.id) === 1;
  const assumptions = singleAssumptions
    ? readRows<AssumptionsRow, ReturnType<typeof rowToAssumptions>>(
        "assumptions",
        assumptionRows,
        rowToAssumptions,
        issues,
      )[0]
    : undefined;
  if (!singleAssumptions)
    issues.push({ table: "assumptions", rule: "MISSING_ASSUMPTIONS" });

  if (issues.length === 0) {
    issues.push(...duplicateKeys(tables));
    // The engine's input rules and the whole-number bounds, as at every other entry
    // point (D-17, D-27, D-37, D-38, D-42, D-54, ADR 0086).
    for (const e of rules(portfolio, assumptions))
      issues.push({
        table: ENTITY_TABLE[e.entity],
        ...(e.id !== undefined && { id: e.id }),
        ...(e.field && { column: snake(e.field) }),
        rule: e.code,
        ...("range" in e && { range: e.range }),
      });
  }
  if (issues.length > 0)
    throw new RestoreError(
      "BACKUP_ROWS_INVALID",
      `The backup has ${issues.length} record(s) the app cannot restore. Nothing was changed.`,
      { issues },
    );

  const statements: SqlStatement[] = [
    ...[...BACKUP_TABLES].reverse().map((t) => ({ query: `DELETE FROM ${t}` })),
    ...BACKUP_TABLES.flatMap((t) =>
      tables[t].map((row) => insertStatement(t, row)),
    ),
  ];
  return { summary: summarise(backup), statements };
}

/** Check `backup` as a whole, then replace every table in one transaction. */
export async function restoreFromJson(
  sql: Sql,
  backup: BackupFile,
  rules: InputRules,
): Promise<void> {
  const { statements } = prepareRestore(backup, rules);
  await sql.transaction(statements);
}

// --- files ----------------------------------------------------------------------

export type ExportOutcome = SaveOutcome;

/** The backup file could not be written (DR-026). */
export class BackupExportError extends Error {
  /** The underlying failure, for display. */
  readonly detail: string;
  constructor(cause: unknown) {
    const detail =
      cause instanceof SaveFileError ? cause.detail : messageOf(cause);
    super(`Could not save the backup: ${detail}`, { cause });
    this.name = "BackupExportError";
    this.detail = detail;
  }
}

/** What `exportBackup` needs from outside the data layer (ADR 0072, DR-167): the local
 *  calendar day for the file name and the file-save function. */
export interface ExportDeps {
  /** Local `yyyy-mm-dd` (lib/today `localIsoDay()`). */
  today: string;
  save: (opts: SaveFileOptions) => Promise<SaveOutcome>;
}

/**
 * Export the whole DB to JSON and hand it to the user via `deps.save`: a cancelled
 * dialog returns `cancelled`; a failed write — or a file that does not read back as
 * written — throws `BackupExportError`.
 */
export async function exportBackup(
  sql: Sql,
  { today, save }: ExportDeps,
): Promise<ExportOutcome> {
  const backup = await exportToJson(sql);
  try {
    return await save({
      filename: `portfolio-backup-${today}.json`,
      data: JSON.stringify(backup, null, 2),
      mime: "application/json",
      filter: { name: "JSON backup", extensions: ["json"] },
    });
  } catch (e) {
    throw new BackupExportError(e);
  }
}

/**
 * Prompt the user to pick a backup JSON file and check it completely, so the confirm
 * step only ever offers a restorable file. Returns `null` when the user cancels;
 * throws RestoreError for a file that cannot be restored.
 */
export async function chooseRestoreFile(rules: InputRules): Promise<{
  file: string;
  backup: BackupFile;
  summary: BackupSummary;
} | null> {
  // Rust opens the dialog and refuses an oversized file before reading it (DR-138).
  let picked: { name: string; text: string } | null;
  try {
    picked = await invoke<{ name: string; text: string } | null>(
      "open_backup_file",
      { maxBytes: BACKUP_MAX_BYTES },
    );
  } catch (e) {
    if (e === "BACKUP_TOO_LARGE") throw backupTooLarge();
    throw e;
  }
  if (picked === null) return null;

  const backup = parseBackupText(picked.text);
  const { summary } = prepareRestore(backup, rules);
  return { file: picked.name, backup, summary };
}

/** The pre-restore safety backup could not be written or verified; nothing changed. */
export class SafetyBackupError extends Error {
  /** The underlying failure, for display. */
  readonly detail: string;
  constructor(cause: unknown) {
    const detail = messageOf(cause);
    super(`Could not save the safety backup: ${detail}`, { cause });
    this.name = "SafetyBackupError";
    this.detail = detail;
  }
}

/**
 * Pre-restore snapshot, so a bad restore is still recoverable from the Restore screen
 * (D-52): `<app config>/backups/portfolio-before-restore-<UTC stamp>.json`, next to the
 * database and its pre-migration backups (DR-136). Written to a temp file and renamed
 * into place, then read back: its row counts must equal the live data. Any failure
 * throws `SafetyBackupError` — without a verified file a restore must not start.
 * `prefix` names the file for other destructive actions. Returns the file name.
 */
export async function writeSafetyBackup(
  sql: Sql,
  now: Date = new Date(),
  prefix = "portfolio-before-restore",
): Promise<string> {
  const safetyBackup = await exportToJson(sql);
  const json = JSON.stringify(safetyBackup, null, 2);
  const filename = `${prefix}-${stamp(now)}.json`;
  try {
    // Temp file + rename in `<app config>/backups`, read back (src-tauri/src/files.rs).
    const readBack = await invoke<string>("write_app_backup", {
      filename,
      json,
    });
    const written = validateBackup(JSON.parse(readBack));
    for (const t of BACKUP_TABLES)
      if (written.tables[t]?.length !== safetyBackup.tables[t]?.length)
        throw new Error(`the saved copy of "${t}" does not match`);
  } catch (e) {
    throw new SafetyBackupError(e);
  }
  return filename;
}

/** Full restore workflow: check the whole file, write and verify the safety backup,
 *  then replace everything in one transaction. Returns the safety backup's name. */
export async function confirmRestore(
  sql: Sql,
  backup: BackupFile,
  rules: InputRules,
): Promise<{ safetyBackup: string }> {
  const { statements } = prepareRestore(backup, rules);
  const safetyBackup = await writeSafetyBackup(sql);
  await sql.transaction(statements);
  return { safetyBackup };
}
