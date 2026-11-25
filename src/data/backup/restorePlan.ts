// The restore plan (P5b): check the WHOLE file — version, shape, every row, the engine's
// input rules — upgrade an older file in memory, and build the statements that replace
// the data in one transaction (D-14): on any failure nothing is planned and the current
// data stays (DR-019). A value outside the form bounds only asks (ADR 0148): the database
// may hold it already. Pure: no IO and no Tauri; backupFiles.ts runs the plan.
import type { SqlStatement } from "../sql";
import { insertStatement } from "../repositories";
import { DELETE_SAMPLE_MARKERS } from "../appMeta";
import { TABLES, restoreDefaults } from "../schema";
import { DataError } from "../errors";
import { spellingKey } from "../../lib/propertyKey";
import { upgradeLegacyOverrides } from "../scenarioOverrides";
import {
  rowToAssumptions,
  rowToHoldingCost,
  rowToLease,
  rowToMortgageBlock,
  rowToProperty,
  rowToScenario,
  rowToValuation,
  toColumn,
  type AssumptionsRow,
  type HoldingCostRow,
  type LeaseRow,
  type MortgageBlockRow,
  type PropertyRow,
  type ScenarioRow,
  type ValuationRow,
} from "../mappers";
import type {
  Assumptions,
  EngineValidationError,
  Portfolio,
  Scenario,
  ValidationEntity,
} from "../../engine";
import type { RangeProblem } from "../../lib/rules";
import {
  BACKUP_COLUMNS,
  BACKUP_TABLES,
  type BackupFile,
  type BackupTable,
} from "./format";
import {
  RestoreError,
  invalid,
  validateBackup,
  type RestoreIssue,
} from "./validate";

/** The engine's input rules plus the whole-number form bounds over
 *  the restored rows (assumptions absent ⇒ portfolio rules only). Injected by the
 *  caller: the data layer never calls engine functions; `checkInputRules` in
 *  src/state/restoreRules.ts is the one the app uses. Scenarios only need to be readable
 *  (ADR 0123): one that breaks a rule restores and is handled like a saved one, so every
 *  backup the app writes restores. A range problem comes without the stored value, which
 *  restore never shows (ADR 0086). */
export type InputRules = (
  portfolio: Portfolio,
  assumptions?: Assumptions,
) => (EngineValidationError | Omit<RangeProblem, "value">)[];

/** The rule a restore only asks about ("Restore anyway"): the whole-number form bounds a
 *  database may already break (ADR 0148 §1). A stored date before the date floor is not
 *  checked (ADR 0232). Every other issue refuses the file. */
const WARNING_RULES: ReadonlySet<RestoreIssue["rule"]> = new Set([
  "OUT_OF_RANGE",
]);

/** Value for a column an older backup lacks: the column's `restoreDefault` in the schema
 *  description. Every column added by a later migration is nullable, except
 *  `properties.active` (v4, default 1) and `assumptions.selling_cost_pct` (v11, default
 *  '0', ADR 0183). */
const ADDED_COLUMN_DEFAULTS: Partial<Record<string, unknown>> =
  restoreDefaults(TABLES);

/** The values each property flag column may hold (the v7 CHECKs, ADR 0148). */
const PROPERTY_FLAGS: [column: string, allowed: readonly unknown[]][] = [
  ["garage", [0, 1, null]],
  ["active", [0, 1]],
];

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
 *  scenario overrides are rewritten to the versioned shape (`upgradeLegacyOverrides`).
 *  A scenario's created_at must be non-empty text: the app never reads it, but it orders
 *  the list and the column is NOT NULL (ADR 0123). */
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
  // The flags the mappers do not check are checked here, so a bad one is named at the confirm
  // step instead of failing the write on its CHECK (ADR 0148). `active` is NOT NULL.
  for (const r of tables.properties)
    for (const [column, allowed] of PROPERTY_FLAGS)
      if (!allowed.includes(r[column]))
        issues.push({
          table: "properties",
          id: String(r.id),
          column,
          rule: "UNREADABLE_VALUE",
        });
  for (const s of tables.scenarios) {
    const unreadable = (column: string) =>
      issues.push({
        table: "scenarios",
        id: String(s.id),
        column,
        rule: "UNREADABLE_VALUE",
      });
    try {
      s.overrides = upgradeLegacyOverrides(String(s.name), String(s.overrides));
    } catch {
      unreadable("overrides");
    }
    if (typeof s.created_at !== "string" || s.created_at.trim() === "")
      unreadable("created_at");
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

/** The portfolio tables read through the guards, in table order. */
function readPortfolio(tables: Tables, issues: RestoreIssue[]): Portfolio {
  return {
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
}

/** Scenarios only need to be readable (ADR 0123). A row upgradeRows already refused is
 *  not read again, so its overrides are not reported twice. */
function readScenarios(tables: Tables, issues: RestoreIssue[]): void {
  const flagged = new Set(
    issues.filter((i) => i.table === "scenarios").map((i) => i.id),
  );
  readRows<ScenarioRow, Scenario>(
    "scenarios",
    tables.scenarios.filter((r) => !flagged.has(String(r.id))),
    rowToScenario,
    issues,
  );
}

/** The single assumptions row (id = 1), or undefined with a MISSING_ASSUMPTIONS issue. */
function readAssumptions(
  tables: Tables,
  issues: RestoreIssue[],
): Assumptions | undefined {
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
  return assumptions;
}

const ENTITY_TABLE: Record<ValidationEntity, BackupTable> = {
  assumptions: "assumptions",
  property: "properties",
  mortgage: "mortgage_blocks",
  valuation: "valuations",
  lease: "leases",
  holdingCost: "holding_costs",
};

/** The stored column behind an engine field, as the issue table names it (ADR 0180 §1):
 *  the mappers store `completionDate` as `interest_only_until` and an assumption default
 *  `defaults.<field>` as `default_<field>`; every other field is its snake case. */
const columnOf = (field: string) =>
  field === "completionDate"
    ? "interest_only_until"
    : toColumn(field.replace(/^defaults\./, "default_"));

/** A key cell as restore compares it: a property name by `spellingKey`, trimmed and
 *  case-insensitive (D-55, ADR 0148 §5), deliberately without the NFC step of
 *  `propertyKey`. A backup the app accepted before must keep restoring, so two stored
 *  names that differ only in Unicode form are not refused here (ADR 0237 Consequences). */
const keyCell = (table: BackupTable, column: string, v: unknown) =>
  table === "properties" && column === "name" && typeof v === "string"
    ? spellingKey(v)
    : v;

/** Rows repeating an earlier row's id or natural key (the schema's UNIQUE keys, all from
 *  v7: no later migration added one). */
function duplicateKeys(tables: Tables): RestoreIssue[] {
  const issues: RestoreIssue[] = [];
  for (const table of BACKUP_TABLES) {
    for (const key of [["id"], ...TABLES[table].unique]) {
      const seen = new Set<string>();
      for (const r of tables[table]) {
        const k = JSON.stringify(key.map((c) => keyCell(table, c, r[c])));
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

/** Duplicate keys, then the engine's input rules and the whole-number bounds, as at every
 *  other entry point (D-17, D-27, D-37, D-38, D-42, D-54, ADR 0086). */
function ruleIssues(
  tables: Tables,
  portfolio: Portfolio,
  assumptions: Assumptions | undefined,
  rules: InputRules,
): RestoreIssue[] {
  const issues = duplicateKeys(tables);
  for (const e of rules(portfolio, assumptions))
    issues.push({
      table: ENTITY_TABLE[e.entity],
      ...(e.id !== undefined && { id: e.id }),
      ...(e.field && { column: columnOf(e.field) }),
      rule: e.code,
      ...("range" in e && { range: e.range }),
    });
  return issues;
}

/** Wipe every table (children first), re-insert the file's rows, and clear the sample
 *  markers: the restored data is the owner's, never the sample (ADR 0127). */
const replaceStatements = (tables: Tables): SqlStatement[] => [
  ...[...BACKUP_TABLES].reverse().map((t) => ({ query: `DELETE FROM ${t}` })),
  ...BACKUP_TABLES.flatMap((t) =>
    tables[t].map((row) => insertStatement(t, row)),
  ),
  DELETE_SAMPLE_MARKERS,
];

export interface PreparedRestore {
  summary: BackupSummary;
  /** Wipe (children first) and re-insert, for one transaction. */
  statements: SqlStatement[];
  /** Values outside the form bounds (OUT_OF_RANGE): the confirm step asks before a
   *  restore with any (ADR 0148). */
  warnings: RestoreIssue[];
}

/**
 * Check every row of `backup` and build the replacement statements. Throws a
 * RestoreError and touches nothing when the file cannot be restored as a whole; a file
 * whose only issues are values outside the form bounds comes back with them as
 * `warnings`.
 */
export function prepareRestore(
  backup: BackupFile,
  rules: InputRules,
): PreparedRestore {
  validateBackup(backup);
  const { tables, issues } = upgradeRows(backup);
  const portfolio = readPortfolio(tables, issues);
  readScenarios(tables, issues);
  const assumptions = readAssumptions(tables, issues);
  if (issues.length === 0)
    issues.push(...ruleIssues(tables, portfolio, assumptions, rules));
  // A refusal after the rules ran lists the warnings too: one table names everything to
  // fix.
  if (issues.some((i) => !WARNING_RULES.has(i.rule)))
    throw new RestoreError(
      "BACKUP_ROWS_INVALID",
      `The backup has ${issues.length} record(s) the app cannot restore. Nothing was changed.`,
      { issues },
    );
  return {
    summary: summarise(backup),
    statements: replaceStatements(tables),
    warnings: issues,
  };
}
