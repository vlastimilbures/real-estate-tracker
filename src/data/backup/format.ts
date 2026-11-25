// The backup file format (P5b): what a backup holds, the columns a restore may write, and
// how the file is read from the database. A backup carries the database schema version
// (DR-038), so a restore can upgrade an older file and refuse a newer one.
import type { Sql } from "../sql";
import { PORTFOLIO_TABLES } from "../repositories";
import { SCHEMA_HEAD } from "../migrations";
import { TABLES, columnNames } from "../schema";

/** The newest schema this app writes and reads (the last migration). */
export { SCHEMA_HEAD };

/** D-53: a backup file larger than this is refused before it is parsed. */
export const BACKUP_MAX_BYTES = 20 * 1024 * 1024;

export interface BackupFile {
  /** The database schema version the file was written at (1 in every file written
   *  before P5b, whatever the database version was). */
  schemaVersion: number;
  exportedAt: string;
  tables: Record<string, Record<string, unknown>[]>;
}

export const BACKUP_TABLES = [
  ...PORTFOLIO_TABLES,
  "assumptions",
  "scenarios",
] as const;

export type BackupTable = (typeof BACKUP_TABLES)[number];

/** The columns a restore may write, per table (current schema, src/data/schema.ts).
 *  Restore refuses any other key: backup keys become SQL identifiers, so they must never
 *  come from the file unchecked (DR-017). A drift test pins the schema description to the
 *  migrated database. */
export const BACKUP_COLUMNS = columnNames(TABLES) as Record<
  BackupTable,
  readonly string[]
>;

/** Every backup table and the schema version, read in one snapshot (DR-134), so a write
 *  that commits during the export is wholly in or wholly out of the file (ADR 0132).
 *  `now` becomes `exportedAt`: the caller reads the clock once and names the file from
 *  the same moment (ADR 0149 §6). */
export async function exportToJson(sql: Sql, now: Date): Promise<BackupFile> {
  const statements = [
    ...BACKUP_TABLES.map((table) => ({ query: `SELECT * FROM ${table}` })),
    { query: "SELECT MAX(version) AS v FROM schema_migrations" },
  ];
  const results = await sql.selectSnapshot(statements);
  // A missing row list would become an empty table: a file that restores with data lost.
  if (results.length !== statements.length)
    throw new Error(
      `the snapshot returned ${results.length} of ${statements.length} result sets`,
    );
  const tables: Record<string, Record<string, unknown>[]> = {};
  BACKUP_TABLES.forEach((table, i) => (tables[table] = results[i] ?? []));
  const version = results[BACKUP_TABLES.length]?.[0]?.v as number | null;
  return {
    schemaVersion: Number(version ?? SCHEMA_HEAD),
    exportedAt: now.toISOString(),
    tables,
  };
}
