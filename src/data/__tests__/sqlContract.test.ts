// #471: the Sql seam's contract, as one set of scenarios (fixtures/sql-contract.json) run
// here against the better-sqlite3 test adapter and in src-tauri/tests/db_contract.rs
// against the app's Rust commands (labels: src-tauri/src/db.rs). A test that passes on the
// test adapter then says the same thing about the app's path.
import { describe, expect, it } from "vitest";
import contract from "./fixtures/sql-contract.json";
import { openMemorySql, type TestSql } from "./betterSqlite";
import type { SqlStatement } from "../sql";

interface Scenario {
  name: string;
  setup?: SqlStatement[];
  statements: SqlStatement[];
  error: string | null;
}

async function fresh(setup: SqlStatement[] = []): Promise<TestSql> {
  const sql = openMemorySql();
  for (const query of contract.schema) await sql.execute(query);
  if (setup.length > 0) await sql.transaction(setup);
  return sql;
}

const count = async (sql: TestSql, table: string) =>
  (await sql.select<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`))[0]?.n;

describe("Sql contract: transaction", () => {
  const scenarios: (Scenario & { counts: Record<string, number> })[] =
    contract.transactions;
  it.each(scenarios.map((s) => [s.name, s] as const))("%s", async (_, s) => {
    const sql = await fresh(s.setup);
    const done = sql.transaction(s.statements);
    if (s.error === null) await done;
    else await expect(done).rejects.toThrow(s.error);
    for (const [table, n] of Object.entries(s.counts))
      expect(await count(sql, table)).toBe(n);
  });
});

describe("Sql contract: selectSnapshot", () => {
  const scenarios: (Scenario & { expected: unknown[][] | null })[] =
    contract.snapshots;
  it.each(scenarios.map((s) => [s.name, s] as const))("%s", async (_, s) => {
    const sql = await fresh(s.setup);
    const read = sql.selectSnapshot(s.statements);
    if (s.error === null) expect(await read).toEqual(s.expected);
    else await expect(read).rejects.toThrow(s.error);
  });
});

describe("Sql contract: backup labels", () => {
  it.each(contract.labels.valid)("accepts %j", async (label) => {
    const sql = await fresh();
    await expect(sql.backup(label)).resolves.toMatch(/\.sqlite$/);
  });
  it.each(contract.labels.invalid)("refuses %j", async (label) => {
    const sql = await fresh();
    await expect(sql.backup(label)).rejects.toThrow(/invalid backup label/);
  });
});
