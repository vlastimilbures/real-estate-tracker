// P5a step 3: safe migrations. A synthetic database at EVERY historical schema version
// migrates to head with its data intact and a verified backup taken first; data that
// would break the new constraints aborts with the database unchanged.
import { describe, it, expect } from "vitest";
import DatabaseConstructor from "better-sqlite3";
import { openMemorySql, type TestSql } from "./betterSqlite";
import { checkIntegrity, migrate, MIGRATIONS } from "../migrations";
import { DataError } from "../errors";
import { loadAssumptions, loadPortfolio, listScenarios } from "../repositories";
import type { Sql } from "../sql";

const HEAD = Math.max(...MIGRATIONS.map((m) => m.version));
const NOW = () => new Date(Date.UTC(2026, 9, 1, 7, 35, 12));

/** A database at schema `version`, built from the historical migrations exactly as the
 *  pre-P5a runner applied them (statement by statement, no transaction). */
async function schemaAt(version: number): Promise<TestSql> {
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

/** Representative synthetic rows, using only the columns that exist at `version`. */
async function fill(sql: Sql, version: number): Promise<void> {
  await sql.execute(
    "INSERT INTO properties (id, name, address, type, size_m2, garage, purchase_date, purchase_price, appreciation_override_pa) VALUES ('p1', 'Flat One', 'Street 1', '2+kk', 55, 1, '2023-02-01', '7500000.50', '0.03')",
  );
  await sql.execute(
    "INSERT INTO properties (id, name, purchase_date, purchase_price) VALUES ('p2', 'Flat Two', '2024-05-10', '4200000')",
  );
  await sql.execute(
    "INSERT INTO mortgage_blocks (id, property_id, start_date, initial_principal, fixation_years, interest_rate_pa, monthly_instalment) VALUES ('m1', 'p1', '2023-02-01', '5000000', 5, '0.0449', '21576.4')",
  );
  if (version >= 2)
    await sql.execute("UPDATE mortgage_blocks SET loan_term_years = 30");
  if (version >= 3)
    await sql.execute(
      `UPDATE mortgage_blocks SET draws = '[{"date":"2023-02-01","amount":"5000000"}]'`,
    );
  if (version >= 4)
    await sql.execute("UPDATE properties SET active = 0 WHERE id = 'p2'");
  if (version >= 6)
    await sql.execute(
      "UPDATE mortgage_blocks SET contract_maturity_date = '2053-02-01'",
    );
  if (version >= 9)
    await sql.execute(
      `UPDATE mortgage_blocks SET prepayments = '[{"date":"2027-02-01","amount":"100000","effect":"shortenTerm"}]', recasts = '[{"date":"2030-02-01","maturity":"2050-02-01"}]'`,
    );
  await sql.execute(
    "INSERT INTO valuations (id, property_id, valid_from, valid_to, market_value) VALUES ('v1', 'p1', '2023-02-01', '2025-12-31', '7600000'), ('v2', 'p1', '2026-01-01', NULL, '8100000')",
  );
  await sql.execute(
    "INSERT INTO leases (id, property_id, start_date, end_date, monthly_rent) VALUES ('l1', 'p1', '2023-03-01', '2024-02-29', '22000'), ('l2', 'p1', '2024-03-01', NULL, '23500')",
  );
  await sql.execute(
    "INSERT INTO holding_costs (id, property_id, property_tax_yr, mgmt_pct_rent) VALUES ('hc-p1', 'p1', '2400', '0.05'), ('hc-p2', 'p2', NULL, NULL)",
  );
  await sql.execute(
    `INSERT INTO assumptions VALUES (1, '2026-06-07', '0.03', '0.025', '0.04', '0.055', 30, '0.025', '2000', '3000', '0.0', '0.05', '1500', '0')`,
  );
  // From v8 the overrides are stored in the versioned spelling.
  const overrides =
    version >= 8
      ? '{"version":1,"appreciationPa":"0.01"}'
      : '{"appreciationPa":"0.01"}';
  await sql.execute(
    "INSERT INTO scenarios (id, name, overrides, created_at) VALUES ('s1', 'Stress', ?, '2026-01-05')",
    [overrides],
  );
}

const TABLES = [
  "properties",
  "mortgage_blocks",
  "valuations",
  "leases",
  "holding_costs",
  "assumptions",
  "scenarios",
];

/** Every row of every table plus the schema — "unchanged" means this is identical. */
function snapshot(sql: TestSql): string {
  const db = sql.db;
  const schema = db
    .prepare("SELECT type, name, sql FROM sqlite_master ORDER BY name")
    .all();
  const data = [...TABLES, "schema_migrations"].map((t) =>
    db.prepare(`SELECT * FROM ${t} ORDER BY 1`).all(),
  );
  return JSON.stringify({ schema, data });
}

function tableRows(sql: TestSql): Record<string, unknown[]> {
  return Object.fromEntries(
    TABLES.map((t) => [
      t,
      sql.db.prepare(`SELECT * FROM ${t} ORDER BY id`).all(),
    ]),
  );
}

async function rejection(p: Promise<unknown>): Promise<DataError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(DataError);
    return e as DataError;
  }
  throw new Error("expected a rejection");
}

describe("migrating every historical schema version to head", () => {
  for (let version = 1; version <= HEAD - 1; version++) {
    it(`v${version} → v${HEAD}: data preserved, verified backup first`, async () => {
      const sql = await schemaAt(version);
      await fill(sql, version);
      const before = tableRows(sql);

      const result = await migrate(sql, { now: NOW });

      expect(result.from).toBe(version);
      expect(result.to).toBe(HEAD);
      const versions = await sql.select<{ version: number }>(
        "SELECT version FROM schema_migrations ORDER BY version",
      );
      expect(versions.map((v) => v.version)).toEqual(
        MIGRATIONS.map((m) => m.version),
      );
      // Every row survives; columns that existed keep their values exactly — except
      // the scenario JSON, which v8 rewrites to the versioned spelling.
      const after = tableRows(sql);
      for (const t of TABLES) {
        expect(after[t], t).toHaveLength(before[t].length);
        after[t].forEach((row, i) => {
          const was = { ...(before[t][i] as Record<string, unknown>) };
          if (t === "scenarios") delete was.overrides;
          expect(row, `${t}[${i}]`).toMatchObject(was);
        });
      }
      expect(after.scenarios[0]).toMatchObject({
        overrides: '{"version":1,"appreciationPa":"0.01"}',
      });
      // The app can load it.
      expect((await loadPortfolio(sql)).properties).toHaveLength(2);
      await loadAssumptions(sql);
      expect(await listScenarios(sql)).toHaveLength(1);

      // The backup is the database as it was, named after the step.
      expect(result.backupPath).toMatch(
        new RegExp(
          `pre-migration-v${version}-to-v${HEAD}-20261001T073512Z\\.sqlite$`,
        ),
      );
      const copy = new DatabaseConstructor(result.backupPath!, {
        readonly: true,
      });
      expect(
        copy.prepare("SELECT MAX(version) AS v FROM schema_migrations").get(),
      ).toEqual({ v: version });
      expect(copy.prepare("SELECT * FROM leases ORDER BY id").all()).toEqual(
        before.leases,
      );
      copy.close();
      sql.db.close();
    });
  }

  it("a brand-new database migrates without a backup (nothing to protect)", async () => {
    const sql = openMemorySql();
    const result = await migrate(sql, { now: NOW });
    expect(result).toEqual({ from: 0, to: HEAD, backupPath: null });
  });

  it("re-running is a no-op", async () => {
    const sql = await schemaAt(HEAD - 1);
    await fill(sql, HEAD - 1);
    await migrate(sql, { now: NOW });
    const once = snapshot(sql);
    expect(await migrate(sql, { now: NOW })).toEqual({
      from: HEAD,
      to: HEAD,
      backupPath: null,
    });
    expect(snapshot(sql)).toBe(once);
  });

  it("a fresh database and a migrated one end with the same schema", async () => {
    const fresh = openMemorySql();
    await migrate(fresh);
    const upgraded = await schemaAt(1);
    await migrate(upgraded, { now: NOW });
    const schema = (s: TestSql) =>
      s.db
        .prepare(
          // schema_migrations itself is created by schemaAt() with different DDL text.
          "SELECT name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name <> 'schema_migrations' ORDER BY name",
        )
        .all();
    expect(schema(upgraded)).toEqual(schema(fresh));
  });
});

describe("migration safety: abort paths leave the database unchanged", () => {
  async function v6WithData(): Promise<TestSql> {
    const sql = await schemaAt(6);
    await fill(sql, 6);
    return sql;
  }

  /** Records whether a backup was attempted. */
  function spyBackup(sql: TestSql): { calls: string[] } {
    const calls: string[] = [];
    const real = sql.backup.bind(sql);
    sql.backup = (label: string) => {
      calls.push(label);
      return real(label);
    };
    return { calls };
  }

  it("duplicate natural keys abort before any change, listing the records", async () => {
    const sql = await v6WithData();
    await sql.execute(
      "INSERT INTO leases (id, property_id, start_date, monthly_rent) VALUES ('l3', 'p1', '2024-03-01', '24000')",
    );
    await sql.execute(
      "INSERT INTO properties (id, name, purchase_date, purchase_price) VALUES ('p3', 'Flat One', '2025-01-01', '1')",
    );
    const before = snapshot(sql);
    const spy = spyBackup(sql);

    const e = await rejection(migrate(sql, { now: NOW }));

    expect(e.code).toBe("MIGRATION_CONFLICT");
    expect(e.details).toEqual([
      'properties "Flat One", "Flat One": duplicate name',
      "leases l2, l3: duplicate property_id + start_date",
    ]);
    expect(snapshot(sql)).toBe(before);
    expect(spy.calls).toEqual([]);
  });

  it("values the new checks reject abort with the record and the rule", async () => {
    const sql = await v6WithData();
    await sql.execute("UPDATE leases SET monthly_rent = '-1' WHERE id = 'l1'");
    await sql.execute(
      "UPDATE valuations SET valid_to = '2022-01-01' WHERE id = 'v1'",
    );
    const before = snapshot(sql);

    const e = await rejection(migrate(sql, { now: NOW }));

    expect(e.code).toBe("MIGRATION_CONFLICT");
    expect(e.details).toEqual([
      'valuations v1 (property "Flat One"): valuation_end_not_before_start',
      'leases l1 (property "Flat One"): lease_rent_not_negative',
    ]);
    expect(snapshot(sql)).toBe(before);
  });

  it("rows pointing at a missing property abort", async () => {
    const sql = await v6WithData();
    sql.db.pragma("foreign_keys = OFF");
    await sql.execute(
      "INSERT INTO leases (id, property_id, start_date, monthly_rent) VALUES ('lx', 'gone', '2024-01-01', '1')",
    );
    sql.db.pragma("foreign_keys = ON");
    const e = await rejection(migrate(sql, { now: NOW }));
    expect(e.code).toBe("MIGRATION_CONFLICT");
    expect(e.details).toEqual([
      'leases lx (property "gone"): refers to a missing property',
    ]);
  });

  it("no verified backup, no migration", async () => {
    const sql = await v6WithData();
    const before = snapshot(sql);
    sql.backup = () => Promise.reject(new Error("BACKUP_FAILED: disk full"));

    const e = await rejection(migrate(sql, { now: NOW }));

    expect(e.code).toBe("MIGRATION_BACKUP_FAILED");
    expect(e.details).toEqual(["BACKUP_FAILED: disk full"]);
    expect(snapshot(sql)).toBe(before);
  });

  it("a migration whose statements fail is rolled back whole", async () => {
    const sql = await v6WithData();
    const before = snapshot(sql);
    const real = sql.transaction.bind(sql);
    // Fail the last statement of the migration (its schema_migrations row).
    sql.transaction = (statements, options) =>
      real(
        [
          ...statements.slice(0, -1),
          { query: "INSERT INTO no_such_table VALUES (1)" },
        ],
        options,
      );

    const e = await rejection(migrate(sql, { now: NOW }));

    expect(e.code).toBe("MIGRATION_FAILED");
    expect(snapshot(sql)).toBe(before);
    expect(sql.db.pragma("foreign_keys", { simple: true })).toBe(1);
  });

  it("a database from a newer app version is refused, untouched (DR-022)", async () => {
    const sql = await v6WithData();
    await migrate(sql, { now: NOW });
    await sql.execute(
      "INSERT INTO schema_migrations (version, name, applied_at) VALUES (99, 'future', 'x')",
    );
    const before = snapshot(sql);
    const e = await rejection(migrate(sql, { now: NOW }));
    expect(e.code).toBe("DB_NEWER");
    expect(e.details).toEqual([`database v99, this app v${HEAD}`]);
    expect(snapshot(sql)).toBe(before);
  });

  it("records when each migration was applied (DR-022)", async () => {
    const sql = await v6WithData();
    await migrate(sql, { now: NOW });
    const rows = await sql.select<{ applied_at: string }>(
      "SELECT applied_at FROM schema_migrations WHERE version > 6",
    );
    expect(rows.map((r) => r.applied_at)).toEqual(
      Array(HEAD - 6).fill("2026-10-01T07:35:12.000Z"),
    );
  });

  it("an integrity-check failure stops startup with a typed error", async () => {
    const sql = openMemorySql();
    const damaged: Sql = {
      ...sql,
      select: <T>(q: string, p?: unknown[]) =>
        q.startsWith("PRAGMA integrity_check")
          ? Promise.resolve([
              { integrity_check: "row 3 missing from index x" },
            ] as T[])
          : sql.select<T>(q, p),
    };
    const e = await rejection(checkIntegrity(damaged));
    expect(e.code).toBe("DB_INTEGRITY");
    expect(e.details).toEqual(["row 3 missing from index x"]);
    await checkIntegrity(sql); // a healthy DB passes
  });
});

describe("v8 versioned scenario JSON", () => {
  async function v7With(overrides: Record<string, string>): Promise<TestSql> {
    const sql = await schemaAt(7);
    for (const [id, json] of Object.entries(overrides))
      await sql.execute(
        "INSERT INTO scenarios (id, name, overrides, created_at) VALUES (?, ?, ?, '2026-01-05')",
        [id, `Scenario ${id}`, json],
      );
    return sql;
  }

  it("rewrites legacy rows to version 1 with the same meaning; v1 rows stay as they are", async () => {
    const v1 = '{"version":1,"rateShock":{"deltaPa":"0.02","durationYears":3}}';
    const sql = await v7With({
      a: '{"valueShockPct":"0.3"}',
      b: "{}",
      c: v1,
    });
    await migrate(sql, { now: NOW });
    const rows = await sql.select<{ id: string; overrides: string }>(
      "SELECT id, overrides FROM scenarios ORDER BY id",
    );
    expect(rows).toEqual([
      {
        id: "a",
        overrides: '{"version":1,"valueShock":{"pct":"0.3","atYear":0}}',
      },
      { id: "b", overrides: '{"version":1}' },
      { id: "c", overrides: v1 },
    ]);
  });

  it("unreadable overrides abort before any change, naming the scenario", async () => {
    const sql = await v7With({ a: '{"appreciationPa":0.05}', b: "{}" });
    const before = snapshot(sql);
    const e = await rejection(migrate(sql, { now: NOW }));
    expect(e.code).toBe("MIGRATION_CONFLICT");
    expect(e.details).toEqual([
      'scenario "Scenario a": overrides appreciationPa is not a decimal string',
    ]);
    expect(snapshot(sql)).toBe(before);
  });
});

describe("v7 constraints hold after migrating", () => {
  async function head(): Promise<TestSql> {
    const sql = await schemaAt(6);
    await fill(sql, 6);
    await migrate(sql, { now: NOW });
    return sql;
  }

  it.each([
    [
      "duplicate property name",
      "INSERT INTO properties (id, name, purchase_date, purchase_price) VALUES ('p9', 'Flat One', '2025-01-01', '1')",
      /UNIQUE constraint failed: properties.name/,
    ],
    [
      "negative purchase price",
      "INSERT INTO properties (id, name, purchase_date, purchase_price) VALUES ('p9', 'X', '2025-01-01', '-5')",
      /property_purchase_price_not_negative/,
    ],
    [
      "non-ISO date",
      "INSERT INTO valuations (id, property_id, valid_from, market_value) VALUES ('v9', 'p1', '1.1.2025', '1')",
      /valuation_valid_from_iso/,
    ],
    [
      "rate above 100 %",
      "UPDATE mortgage_blocks SET interest_rate_pa = '1.5'",
      /mortgage_rate_0_to_1/,
    ],
    [
      "second holding-costs row",
      "INSERT INTO holding_costs (id, property_id) VALUES ('hc-dup', 'p1')",
      /UNIQUE constraint failed: holding_costs.property_id/,
    ],
    [
      "duplicate block start",
      "INSERT INTO mortgage_blocks (id, property_id, start_date, initial_principal, fixation_years, interest_rate_pa, monthly_instalment) VALUES ('m9', 'p1', '2023-02-01', '1', 1, '0.01', '1')",
      /UNIQUE constraint failed: mortgage_blocks.property_id, mortgage_blocks.start_date/,
    ],
  ])("rejects a %s", async (_label, statement, error) => {
    const sql = await head();
    await expect(sql.execute(statement)).rejects.toThrow(error);
  });

  it("still cascades a property delete to its rows", async () => {
    const sql = await head();
    await sql.execute("DELETE FROM properties WHERE id = 'p1'");
    for (const t of ["mortgage_blocks", "valuations", "leases"])
      expect(
        await sql.select(`SELECT 1 FROM ${t} WHERE property_id = 'p1'`),
        t,
      ).toHaveLength(0);
  });
});
