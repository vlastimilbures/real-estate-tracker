// DR-024 / D-16: the sample portfolio is seeded on the FIRST run only. An empty
// portfolio later (all properties deleted, or an empty backup restored) stays empty.
import { describe, it, expect, afterEach } from "vitest";
import { openMemorySql, type TestSql } from "./betterSqlite";
import { migrate, MIGRATIONS } from "../migrations";
import { seedIfEmpty } from "../seed";
import { exportToJson, restoreFromJson } from "../backup";
import { checkInputRules } from "../../import/inputRules";

let sql: TestSql;
afterEach(() => sql.db.close());

async function propertyCount(): Promise<number> {
  return (await sql.select("SELECT id FROM properties")).length;
}

/** The app's launch recipe (portfolioStore `defaultOpen`). */
async function launch(): Promise<boolean> {
  await migrate(sql);
  return seedIfEmpty(sql);
}

describe("seedIfEmpty — first run only (DR-024)", () => {
  it("seeds a brand-new database once", async () => {
    sql = openMemorySql();
    expect(await launch()).toBe(true);
    expect(await propertyCount()).toBe(3);
    expect(await launch()).toBe(false);
    expect(await propertyCount()).toBe(3);
  });

  it("does not re-seed after the owner deleted every property", async () => {
    sql = openMemorySql();
    await launch();
    await sql.execute("DELETE FROM properties");

    expect(await launch()).toBe(false);
    expect(await propertyCount()).toBe(0);
  });

  it("does not re-seed after restoring a backup with an empty portfolio", async () => {
    sql = openMemorySql();
    await launch();
    const b = await exportToJson(sql, new Date());
    await restoreFromJson(
      sql,
      {
        ...b,
        tables: {
          ...b.tables,
          properties: [],
          mortgage_blocks: [],
          valuations: [],
          leases: [],
          holding_costs: [],
        },
      },
      checkInputRules,
    );

    expect(await launch()).toBe(false);
    expect(await propertyCount()).toBe(0);
  });

  it("treats an existing pre-flag database (schema v4) as already seeded", async () => {
    // Synthetic v4 DB: launched before (assumptions row present), portfolio emptied.
    sql = openMemorySql();
    await sql.execute(
      "CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)",
    );
    for (const m of MIGRATIONS.filter((m) => m.version <= 4)) {
      for (const stmt of m.sql.split(";")) {
        if (stmt.trim()) await sql.execute(stmt.trim());
      }
      await sql.execute(
        "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)",
        [m.version, m.name, "1970-01-01T00:00:00.000Z"],
      );
    }
    const fresh = openMemorySql();
    await migrate(fresh);
    await seedIfEmpty(fresh);
    const [assumptions] = await fresh.select<Record<string, unknown>>(
      "SELECT * FROM assumptions",
    );
    fresh.db.close();
    const cols = Object.keys(assumptions);
    await sql.execute(
      `INSERT INTO assumptions (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`,
      Object.values(assumptions),
    );

    expect(await launch()).toBe(false);
    expect(await propertyCount()).toBe(0);
  });

  it("marks a pre-flag database that still has properties as seeded", async () => {
    sql = openMemorySql();
    await launch();
    // Simulate a DB that has data but no flag row (e.g. flag table added later).
    await sql.execute("DELETE FROM app_meta");
    expect(await launch()).toBe(false);
    await sql.execute("DELETE FROM properties");
    expect(await launch()).toBe(false);
    expect(await propertyCount()).toBe(0);
  });
});
