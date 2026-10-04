// A database at a historical schema version, for the migration tests.
import { openMemorySql, type TestSql } from "./betterSqlite";
import { MIGRATIONS } from "../migrations";

/** A database at schema `version`, built from the historical migrations exactly as the
 *  pre-P5a runner applied them (statement by statement, no transaction). */
export async function schemaAt(version: number): Promise<TestSql> {
  const sql = openMemorySql();
  await sql.execute(
    "CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)",
  );
  for (const m of MIGRATIONS.filter((m) => m.version <= version)) {
    for (const stmt of m.sql.split(";")) {
      if (stmt.trim()) await sql.execute(stmt.trim());
    }
    await sql.execute(
      "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)",
      [m.version, m.name, "1970-01-01T00:00:00.000Z"],
    );
  }
  return sql;
}
