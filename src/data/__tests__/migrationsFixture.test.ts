// #118 (R3-10): the app runs its migrations on the SQLite that sqlx bundles (3.46), while
// every Vitest test uses better-sqlite3's newer copy. `src-tauri/tests/migrations_sql.rs`
// applies the real migration SQL on the bundled engine; this test keeps its fixture in
// step with MIGRATIONS. After changing a migration, regenerate it with
//   UPDATE_FIXTURES=1 pnpm vitest run src/data/__tests__/migrationsFixture.test.ts
// and format it (`pnpm exec prettier --write src-tauri/tests/fixtures/migrations.json`;
// the comparison is on parsed JSON, so formatting never fails it).
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { openMemorySql } from "./betterSqlite";
import { migrate, MIGRATIONS } from "../migrations";
import { BACKUP_COLUMNS } from "../backup";

const FIXTURE = join(
  __dirname,
  "..",
  "..",
  "..",
  "src-tauri",
  "tests",
  "fixtures",
  "migrations.json",
);

/** What the Rust test needs: each migration's SQL (its `precheck` and `build` are JS
 *  only) and the head schema's columns per table, as better-sqlite3 reports them. */
async function expected(): Promise<unknown> {
  const db = openMemorySql();
  await migrate(db);
  const headColumns: Record<string, string[]> = {};
  for (const table of Object.keys(BACKUP_COLUMNS)) {
    const info = await db.select<{ name: string }>(
      "SELECT name FROM pragma_table_info(?) ORDER BY cid",
      [table],
    );
    headColumns[table] = info.map((c) => c.name);
  }
  db.db.close();
  return {
    migrations: MIGRATIONS.map((m) => ({
      version: m.version,
      name: m.name,
      sql: m.sql,
      foreignKeysOff: m.foreignKeysOff ?? false,
    })),
    headColumns,
  };
}

describe("Rust migration fixture", () => {
  it("matches MIGRATIONS and the head schema", async () => {
    const want = await expected();
    if (process.env.UPDATE_FIXTURES === "1") {
      writeFileSync(FIXTURE, `${JSON.stringify(want, null, 2)}\n`);
    }
    const have: unknown = JSON.parse(readFileSync(FIXTURE, "utf8"));
    expect(have).toEqual(want);
  });
});
