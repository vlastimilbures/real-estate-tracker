// A database at an older schema version, for the migration tests.
import { openMemorySql, type TestSql } from "../betterSqlite";
import { BASELINE, MIGRATIONS } from "../../migrations";

/** A database at schema `version` (the version 8 baseline or later, ADR 0230), built from
 *  the baseline and the later steps statement by statement, outside a transaction. */
export async function schemaAt(version: number): Promise<TestSql> {
  if (version < BASELINE.version)
    throw new Error(`schema v${version} is below the v8 baseline (ADR 0230)`);
  const sql = openMemorySql();
  const run = async (text: string) => {
    for (const stmt of text.split(";"))
      if (stmt.trim()) await sql.execute(stmt.trim());
  };
  const record = (step: { version: number; name: string }) =>
    sql.execute(
      "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)",
      [step.version, step.name, "1970-01-01T00:00:00.000Z"],
    );
  await sql.execute(
    "CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)",
  );
  await run(BASELINE.sql);
  for (const s of BASELINE.steps) await record(s);
  for (const m of MIGRATIONS.filter((m) => m.version <= version)) {
    await run(m.sql);
    await record(m);
  }
  return sql;
}
