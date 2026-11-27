// P5a step 3: safe migrations. A synthetic database at every schema version from the
// version 8 baseline (ADR 0230) migrates to head with its data intact and a verified
// backup taken first; a failed step is rolled back and reported.
import { describe, it, expect } from "vitest";
import DatabaseConstructor from "better-sqlite3";
import { openMemorySql, type TestSql } from "./betterSqlite";
import { schemaAt } from "./support/schemaAt";
import { BASELINE, checkIntegrity, migrate, MIGRATIONS } from "../migrations";
import { DataError } from "../errors";
import { describeFailure } from "../errorLog";
import { CommandError } from "../../platform/commandError";
import type { Sql } from "../sql";
import { listScenarios, loadAssumptions, loadPortfolio } from "./support/reads";

const HEAD = Math.max(...MIGRATIONS.map((m) => m.version));
const NOW = () => new Date(Date.UTC(2026, 9, 1, 7, 35, 12));

/** Every recorded version of a database at head. */
const ALL_VERSIONS = [...BASELINE.steps, ...MIGRATIONS].map((m) => m.version);

/** Representative synthetic rows, using only the columns that exist at `version` (8 or
 *  later). */
async function fill(sql: Sql, version: number): Promise<void> {
  await sql.execute(
    "INSERT INTO properties (id, name, address, type, size_m2, garage, purchase_date, purchase_price, appreciation_override_pa) VALUES ('p1', 'Flat One', 'Street 1', '2+kk', 55, 1, '2023-02-01', '7500000.50', '0.03')",
  );
  await sql.execute(
    "INSERT INTO properties (id, name, purchase_date, purchase_price, active) VALUES ('p2', 'Flat Two', '2024-05-10', '4200000', 0)",
  );
  await sql.execute(
    `INSERT INTO mortgage_blocks (id, property_id, start_date, initial_principal, fixation_years, interest_rate_pa, monthly_instalment, loan_term_years, draws, contract_maturity_date) VALUES ('m1', 'p1', '2023-02-01', '5000000', 5, '0.0449', '21576.4', 30, '[{"date":"2023-02-01","amount":"5000000"}]', '2053-02-01')`,
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
  await sql.execute(
    `INSERT INTO scenarios (id, name, overrides, created_at) VALUES ('s1', 'Stress', '{"version":1,"appreciationPa":"0.01"}', '2026-01-05')`,
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
  for (let version = BASELINE.version; version <= HEAD - 1; version++) {
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
      expect(versions.map((v) => v.version)).toEqual(ALL_VERSIONS);
      // Every row survives; columns that existed keep their values exactly (the scenario
      // JSON is checked on its own below).
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
    const upgraded = await schemaAt(BASELINE.version);
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
  async function v8WithData(): Promise<TestSql> {
    const sql = await schemaAt(8);
    await fill(sql, 8);
    return sql;
  }

  it("no verified backup, no migration", async () => {
    const sql = await v8WithData();
    const before = snapshot(sql);
    sql.backup = () => Promise.reject(new Error("BACKUP_FAILED: disk full"));

    const e = await rejection(migrate(sql, { now: NOW }));

    expect(e.code).toBe("MIGRATION_BACKUP_FAILED");
    expect(e.details).toEqual(["BACKUP_FAILED: disk full"]);
    expect(snapshot(sql)).toBe(before);
    // Only before the first commit, so never a partial upgrade (ADR 0153).
    expect(e.upgrade).toBeUndefined();
  });

  // ADR 0270 point 7: the startup log line names the Rust code behind the stop.
  it("a failed safety backup logs the Rust code at startup", async () => {
    const sql = await v8WithData();
    sql.backup = () =>
      Promise.reject(new CommandError("BACKUP_FAILED", "disk full"));

    const e = await rejection(migrate(sql, { now: NOW }));

    expect(describeFailure("STARTUP", e)).toEqual({
      code: "MIGRATION_BACKUP_FAILED",
      context: "BACKUP_FAILED: STARTUP: disk full",
    });
  });

  it("a migration whose statements fail is rolled back whole", async () => {
    const sql = await v8WithData();
    const before = snapshot(sql);
    const real = sql.transaction.bind(sql);
    // Fail the last statement of the migration (its schema_migrations row).
    sql.transaction = (statements) =>
      real([
        ...statements.slice(0, -1),
        { query: "INSERT INTO no_such_table VALUES (1)" },
      ]);

    const e = await rejection(migrate(sql, { now: NOW }));

    expect(e.code).toBe("MIGRATION_FAILED");
    expect(snapshot(sql)).toBe(before);
    expect(sql.db.pragma("foreign_keys", { simple: true })).toBe(1);
  });

  it("a database from a newer app version is refused, untouched (DR-022)", async () => {
    const sql = await v8WithData();
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
    const sql = await v8WithData();
    await migrate(sql, { now: NOW });
    const rows = await sql.select<{ applied_at: string }>(
      "SELECT applied_at FROM schema_migrations WHERE version > 8",
    );
    expect(rows.map((r) => r.applied_at)).toEqual(
      Array(HEAD - 8).fill("2026-10-01T07:35:12.000Z"),
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

// #115 (ADR 0153): each step commits on its own, so an upgrade that stops after the first
// step has changed the database. The error says how far it got and where the copy is.
describe("a stopped upgrade reports how far it got", () => {
  const COPY = new RegExp(
    `pre-migration-v8-to-v${HEAD}-20261001T073512Z\\.sqlite$`,
  );

  async function versions(sql: Sql): Promise<number[]> {
    const rows = await sql.select<{ version: number }>(
      "SELECT version FROM schema_migrations ORDER BY version",
    );
    return rows.map((r) => r.version);
  }

  /** Fail the `n`th transaction of the upgrade. */
  function failTransaction(sql: TestSql, n: number): void {
    const real = sql.transaction.bind(sql);
    let calls = 0;
    sql.transaction = (statements) =>
      ++calls === n
        ? Promise.reject(new Error("disk I/O error"))
        : real(statements);
  }

  async function v8WithData(): Promise<TestSql> {
    const sql = await schemaAt(8);
    await fill(sql, 8);
    return sql;
  }

  it("a failed step after v9 committed reports v9 and the copy", async () => {
    const sql = await v8WithData();
    failTransaction(sql, 2);

    const e = await rejection(migrate(sql, { now: NOW }));

    expect(e.code).toBe("MIGRATION_FAILED");
    expect(await versions(sql)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(e.upgrade).toEqual({
      from: 8,
      reached: 9,
      stoppedAt: 10,
      backupPath: expect.stringMatching(COPY),
    });
    expect(e.message).toContain("upgraded to v9");
    expect(e.message).not.toContain("Nothing was changed");
  });

  it("a failed first step changed nothing; its copy was written before it", async () => {
    const sql = await v8WithData();
    failTransaction(sql, 1);

    const e = await rejection(migrate(sql, { now: NOW }));

    expect(e.code).toBe("MIGRATION_FAILED");
    expect(await versions(sql)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(e.upgrade).toEqual({
      from: 8,
      reached: 8,
      stoppedAt: 9,
      backupPath: expect.stringMatching(COPY),
    });
    expect(e.message).toContain("Nothing was changed");
  });

  it("a new database gets v8 in one step, then 9 onwards (ADR 0230)", async () => {
    const sql = openMemorySql();
    failTransaction(sql, 2);

    const e = await rejection(migrate(sql, { now: NOW }));

    expect(e.code).toBe("MIGRATION_FAILED");
    expect(await versions(sql)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(e.upgrade).toEqual({
      from: 0,
      reached: 8,
      stoppedAt: 9,
      backupPath: null,
    });
  });

  it("a new database whose first step fails keeps nothing, not even schema_migrations", async () => {
    const sql = openMemorySql();
    failTransaction(sql, 1);

    const e = await rejection(migrate(sql, { now: NOW }));

    expect(e.upgrade).toEqual({
      from: 0,
      reached: 0,
      stoppedAt: 8,
      backupPath: null,
    });
    expect(sql.db.prepare("SELECT name FROM sqlite_master").all()).toEqual([]);
  });
});

describe("v7 constraints hold after migrating", () => {
  async function head(): Promise<TestSql> {
    const sql = await schemaAt(8);
    await fill(sql, 8);
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
