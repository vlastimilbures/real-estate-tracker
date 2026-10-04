// Backup round-trip test: export → restore produces identical data + identical engine output.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { openMemorySql, type TestSql } from "./betterSqlite";
import { migrate, MIGRATIONS } from "../migrations";
import { seedIfEmpty } from "../seed";
import { loadPortfolio, loadAssumptions } from "../repositories";
import {
  exportToJson,
  prepareRestore,
  restoreFromJson,
  validateBackup,
  SCHEMA_HEAD,
  BACKUP_COLUMNS,
} from "../backup";
import { checkInputRules } from "../../import/inputRules";
import type { Sql } from "../sql";
import { portfolioSnapshot } from "../../engine";
import {
  rowToScenario,
  rowToMortgageBlock,
  type ScenarioRow,
  type MortgageBlockRow,
} from "../mappers";

let sql: TestSql;

beforeAll(async () => {
  sql = openMemorySql();
  await migrate(sql);
  await seedIfEmpty(sql);
});

afterAll(() => sql.db.close());

describe("Backup round-trip", () => {
  it("exports the seeded portfolio to a valid BackupFile", async () => {
    const backup = await exportToJson(sql);
    expect(backup.schemaVersion).toBe(SCHEMA_HEAD);
    expect(typeof backup.exportedAt).toBe("string");
    expect(backup.tables.properties).toHaveLength(3);
    expect(backup.tables.mortgage_blocks).toHaveLength(3);
    expect(backup.tables.valuations).toHaveLength(3);
    expect(backup.tables.leases).toHaveLength(4);
    expect(backup.tables.holding_costs).toHaveLength(3);
    expect(backup.tables.assumptions).toHaveLength(1);
  });

  it("restores to identical row counts and engine output", async () => {
    const backup = await exportToJson(sql);
    const portfolioBefore = await loadPortfolio(sql);
    const assumptionsBefore = await loadAssumptions(sql);
    const snapBefore = portfolioSnapshot(portfolioBefore, assumptionsBefore);

    await restoreFromJson(sql, backup, checkInputRules);

    // Same row counts per table
    for (const [table, rows] of Object.entries(backup.tables)) {
      const after = await sql.select<Record<string, unknown>>(
        `SELECT * FROM ${table}`,
      );
      expect(after, `row count for ${table}`).toHaveLength(
        (rows as unknown[]).length,
      );
    }

    // Same engine output
    const portfolioAfter = await loadPortfolio(sql);
    const assumptionsAfter = await loadAssumptions(sql);
    const snapAfter = portfolioSnapshot(portfolioAfter, assumptionsAfter);

    const KC = 1;
    expect(
      Math.abs(
        snapAfter.totalValue.toNumber() - snapBefore.totalValue.toNumber(),
      ),
    ).toBeLessThanOrEqual(KC);
    expect(
      Math.abs(
        snapAfter.totalDebt.toNumber() - snapBefore.totalDebt.toNumber(),
      ),
    ).toBeLessThanOrEqual(KC);
    expect(
      Math.abs(snapAfter.noi.toNumber() - snapBefore.noi.toNumber()),
    ).toBeLessThanOrEqual(KC);
    expect(
      Math.abs(
        snapAfter.netCashFlow.toNumber() - snapBefore.netCashFlow.toNumber(),
      ),
    ).toBeLessThanOrEqual(KC);
  });

  it("restore is idempotent (second restore from same backup gives same counts)", async () => {
    const backup = await exportToJson(sql);
    await restoreFromJson(sql, backup, checkInputRules);
    await restoreFromJson(sql, backup, checkInputRules);
    const props = await sql.select<unknown[]>("SELECT * FROM properties");
    expect(props).toHaveLength(3);
  });
});

// ADR 0132 (#138, R3-05): the export reads one snapshot, so a write that commits while it
// runs is wholly in or wholly out of the file, never half.
describe("exportToJson reads one database state", () => {
  /** A copy of the first `table` row with `changes`, as one INSERT. */
  async function copyRow(
    db: Sql,
    table: string,
    changes: Record<string, unknown>,
  ): Promise<{ query: string; params: unknown[] }> {
    const [row] = await db.select(`SELECT * FROM ${table} LIMIT 1`);
    const r = { ...row, ...changes };
    const cols = Object.keys(r);
    return {
      query: `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`,
      params: Object.values(r),
    };
  }

  it("a property and its valuation added mid-export are not split across the file", async () => {
    const db = openMemorySql();
    await migrate(db);
    await seedIfEmpty(db);
    const before = await exportToJson(db);
    const write = [
      await copyRow(db, "properties", { id: "p-late", name: "Late" }),
      await copyRow(db, "valuations", { id: "v-late", property_id: "p-late" }),
    ];
    // The write commits right after the export's first read returns.
    let wrote = false;
    const afterFirstRead = async <T>(read: Promise<T>): Promise<T> => {
      const rows = await read;
      if (!wrote) {
        wrote = true;
        await db.transaction(write);
      }
      return rows;
    };
    const racing: Sql = {
      ...db,
      select: (q, p) => afterFirstRead(db.select(q, p)),
      selectSnapshot: (st) => afterFirstRead(db.selectSnapshot(st)),
    };

    const file = await exportToJson(racing);

    expect(wrote).toBe(true);
    expect(() => prepareRestore(file, checkInputRules)).not.toThrow();
    expect(file.tables).toEqual(before.tables);
  });

  it("refuses a snapshot short of a table instead of writing it empty", async () => {
    const short: Sql = {
      ...sql,
      selectSnapshot: async (st) => (await sql.selectSnapshot(st)).slice(0, -2),
    };
    await expect(exportToJson(short)).rejects.toThrow(
      "the snapshot returned 6 of 8 result sets",
    );
  });

  // Pins what the race test above cannot see: the schema version is in the same snapshot.
  it("reads the tables and the schema version in one snapshot call", async () => {
    let snapshots = 0;
    let selects = 0;
    const counting: Sql = {
      ...sql,
      select: (q, p) => {
        selects++;
        return sql.select(q, p);
      },
      selectSnapshot: (st) => {
        snapshots++;
        return sql.selectSnapshot(st);
      },
    };
    await exportToJson(counting);
    expect({ snapshots, selects }).toEqual({ snapshots: 1, selects: 0 });
  });
});

describe("validateBackup", () => {
  it("accepts a valid backup object", async () => {
    const backup = await exportToJson(sql);
    expect(() => validateBackup(backup)).not.toThrow();
  });

  it("rejects wrong schema version", () => {
    expect(() =>
      validateBackup({
        schemaVersion: 99,
        exportedAt: "2026-01-01T00:00:00Z",
        tables: {},
      }),
    ).toThrow(/Unsupported schema version/);
  });

  it("rejects missing schemaVersion", () => {
    expect(() =>
      validateBackup({ exportedAt: "2026-01-01T00:00:00Z", tables: {} }),
    ).toThrow();
  });

  it("rejects non-object", () => {
    expect(() => validateBackup("not an object")).toThrow();
    expect(() => validateBackup(null)).toThrow();
    expect(() => validateBackup(42)).toThrow();
  });
});

describe("restoreFromJson — refuses a backup missing a required table", () => {
  it("throws AND leaves the live assumptions row intact (no destructive wipe)", async () => {
    const live = await loadAssumptions(sql); // the seeded, live assumptions
    const good = await exportToJson(sql);
    // A backup whose `assumptions` table key is absent at runtime (corrupt/partial file).
    const bad = { ...good, tables: { ...good.tables } };
    delete (bad.tables as Record<string, unknown>).assumptions;

    await expect(
      restoreFromJson(sql, bad as typeof good, checkInputRules),
    ).rejects.toThrow(/assumptions/);

    // The live assumptions survived — the guard fired before the DELETE loop.
    const after = await loadAssumptions(sql);
    expect(after.baseDate.getTime()).toBe(live.baseDate.getTime());
    expect(after.horizonYears).toBe(live.horizonYears);
    // and the portfolio tables are untouched too
    const props = await sql.select<unknown[]>("SELECT * FROM properties");
    expect(props).toHaveLength(3);
  });
});

describe("restoreFromJson — rolls back a partial/failing restore", () => {
  it("leaves the DB unchanged when a row fails to insert mid-restore", async () => {
    const portfolioBefore = await loadPortfolio(sql);
    const assumptionsBefore = await loadAssumptions(sql);
    const snapBefore = portfolioSnapshot(portfolioBefore, assumptionsBefore);

    // Valid backup that passes the pre-wipe guards (table keys, column whitelist, scalar
    // cells), but corrupt one late-table row so it fails on INSERT (NOT NULL → sqlite
    // rejects it) partway through the wipe.
    const good = await exportToJson(sql);
    const leases = (good.tables.leases as Record<string, unknown>[]).map(
      (r) => ({ ...r }),
    );
    expect(leases.length).toBeGreaterThan(0);
    leases[0] = { ...leases[0], monthly_rent: null };
    const bad = { ...good, tables: { ...good.tables, leases } };

    await expect(
      restoreFromJson(sql, bad as typeof good, checkInputRules),
    ).rejects.toThrow();

    // Every table is back to its original row count (no partial wipe survives).
    for (const [table, rows] of Object.entries(good.tables)) {
      const after = await sql.select<Record<string, unknown>>(
        `SELECT * FROM ${table}`,
      );
      expect(after, `row count for ${table}`).toHaveLength(
        (rows as unknown[]).length,
      );
    }

    // …and engine output is identical to before the failed restore.
    const portfolioAfter = await loadPortfolio(sql);
    const assumptionsAfter = await loadAssumptions(sql);
    const snapAfter = portfolioSnapshot(portfolioAfter, assumptionsAfter);
    const KC = 1;
    expect(
      Math.abs(
        snapAfter.totalValue.toNumber() - snapBefore.totalValue.toNumber(),
      ),
    ).toBeLessThanOrEqual(KC);
    expect(
      Math.abs(
        snapAfter.totalDebt.toNumber() - snapBefore.totalDebt.toNumber(),
      ),
    ).toBeLessThanOrEqual(KC);
    expect(
      Math.abs(snapAfter.noi.toNumber() - snapBefore.noi.toNumber()),
    ).toBeLessThanOrEqual(KC);
    expect(
      Math.abs(
        snapAfter.netCashFlow.toNumber() - snapBefore.netCashFlow.toNumber(),
      ),
    ).toBeLessThanOrEqual(KC);
  });
});

/** A fresh migrated + seeded DB, independent of the shared `sql` above. */
async function freshSeeded(): Promise<TestSql> {
  const db = openMemorySql();
  await migrate(db);
  await seedIfEmpty(db);
  return db;
}

/** Wraps a Sql and records every statement it is asked to run. */
function recording(inner: TestSql): { sql: Sql; queries: string[] } {
  const queries: string[] = [];
  return {
    queries,
    sql: {
      execute(query, params) {
        queries.push(query);
        return inner.execute(query, params);
      },
      select(query, params) {
        queries.push(query);
        return inner.select(query, params);
      },
      selectSnapshot(statements) {
        for (const s of statements) queries.push(s.query);
        return inner.selectSnapshot(statements);
      },
      transaction(statements, options) {
        for (const s of statements) queries.push(s.query);
        return inner.transaction(statements, options);
      },
      backup(label) {
        return inner.backup(label);
      },
    },
  };
}

async function rowCounts(db: Sql): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const table of Object.keys(BACKUP_COLUMNS)) {
    const rows = await db.select<unknown>(`SELECT * FROM ${table}`);
    out[table] = rows.length;
  }
  return out;
}

/** Per backup table, the columns of the head schema that the v1 schema lacks. */
async function columnsAddedAfterV1(): Promise<Record<string, string[]>> {
  const v1 = openMemorySql();
  v1.db.exec(MIGRATIONS[0]!.sql);
  const head = openMemorySql();
  await migrate(head);
  const names = async (db: Sql, table: string) =>
    (
      await db.select<{ name: string }>(
        "SELECT name FROM pragma_table_info(?)",
        [table],
      )
    ).map((c) => c.name);
  const out: Record<string, string[]> = {};
  for (const table of Object.keys(BACKUP_COLUMNS)) {
    const old = await names(v1, table);
    expect(old.length, `${table} exists at v1`).toBeGreaterThan(0);
    out[table] = (await names(head, table)).filter((c) => !old.includes(c));
  }
  v1.db.close();
  head.db.close();
  return out;
}

describe("restoreFromJson — column whitelist (DR-017)", () => {
  it("rejects a backup whose row keys are not known columns, before touching the DB", async () => {
    const db = await freshSeeded();
    const good = await exportToJson(db);
    const before = await rowCounts(db);
    const scenarios = [
      {
        "id, name, overrides, created_at) VALUES ('a','b','{}','c'); DROP TABLE properties; --":
          "x",
      },
    ];
    const bad = { ...good, tables: { ...good.tables, scenarios } };
    const rec = recording(db);

    await expect(
      restoreFromJson(rec.sql, bad, checkInputRules),
    ).rejects.toThrow(
      /unknown column .* in table "scenarios" — restore aborted/,
    );
    // Nothing was deleted or inserted, and no statement carried the crafted key.
    expect(rec.queries.some((q) => /^\s*(DELETE|INSERT)/i.test(q))).toBe(false);
    expect(rec.queries.some((q) => q.includes("DROP TABLE"))).toBe(false);
    expect(await rowCounts(db)).toEqual(before);
    db.db.close();
  });

  it("rejects a non-scalar cell (object/array) before touching the DB", async () => {
    const db = await freshSeeded();
    const good = await exportToJson(db);
    const before = await rowCounts(db);
    for (const cell of [{ nested: 1 }, [1, 2], true]) {
      const leases = good.tables.leases.map((r) => ({ ...r }));
      leases[0] = { ...leases[0], monthly_rent: cell };
      const bad = { ...good, tables: { ...good.tables, leases } };
      const rec = recording(db);
      await expect(
        restoreFromJson(rec.sql, bad, checkInputRules),
      ).rejects.toThrow(
        /invalid value in column "monthly_rent" of table "leases" — restore aborted/,
      );
      expect(rec.queries.some((q) => /^\s*(DELETE|INSERT)/i.test(q))).toBe(
        false,
      );
    }
    expect(await rowCounts(db)).toEqual(before);
    db.db.close();
  });

  it("restores an older backup that lacks later-added columns", async () => {
    // Tripwire (#118, R3-06): every column a migration added after v1 is stripped, so
    // the backup looks like one from v1. Each such column must come back as its schema
    // default, or NULL: a NOT NULL column with no ADDED_COLUMN_DEFAULTS entry fails here.
    const added = await columnsAddedAfterV1();
    expect(added.properties).toContain("active");
    expect(added.mortgage_blocks).toEqual(
      expect.arrayContaining(["prepayments", "recasts"]),
    );
    const db = await freshSeeded();
    await db.execute(
      `INSERT INTO scenarios (id, name, overrides, created_at) VALUES ('s1', 'Stress', '{"version":1,"appreciationPa":"0.01"}', '2026-01-05')`,
    );
    const good = await exportToJson(db);
    const before = await rowCounts(db);
    for (const [table, n] of Object.entries(before))
      expect(n, `${table} has a row to check`).toBeGreaterThan(0);
    const strip = (rows: Record<string, unknown>[], cols: string[]) =>
      rows.map((r) =>
        Object.fromEntries(
          Object.entries(r).filter(([k]) => !cols.includes(k)),
        ),
      );
    const tables = Object.fromEntries(
      Object.entries(good.tables).map(([table, rows]) => [
        table,
        strip(rows, added[table] ?? []),
      ]),
    ) as typeof good.tables;
    await restoreFromJson(db, { ...good, tables }, checkInputRules);
    expect(await rowCounts(db)).toEqual(before);
    for (const [table, cols] of Object.entries(added)) {
      const info = await db.select<{ name: string; dflt_value: string | null }>(
        "SELECT name, dflt_value FROM pragma_table_info(?)",
        [table],
      );
      for (const col of cols) {
        const dflt = info.find((c) => c.name === col)?.dflt_value ?? null;
        const expected =
          dflt === null
            ? null
            : (await db.select<{ v: unknown }>(`SELECT ${dflt} AS v`))[0]?.v;
        const restored = await db.select<{ v: unknown }>(
          `SELECT ${col} AS v FROM ${table}`,
        );
        for (const r of restored) expect(r.v, `${table}.${col}`).toBe(expected);
      }
    }
    db.db.close();
  });

  it("a backup round-trips a funding record (ADR 0119)", async () => {
    const db = await freshSeeded();
    await db.execute(
      "UPDATE properties SET own_cash = '1500000.5', transaction_costs = '95000', initial_works = '0', funding_note = 'Deposit' WHERE rowid = 1",
    );
    const cols =
      "SELECT id, own_cash, transaction_costs, initial_works, funding_note FROM properties ORDER BY id";
    const before = await db.select<Record<string, unknown>>(cols);
    expect(before.filter((r) => r.own_cash !== null)).toHaveLength(1);
    await restoreFromJson(db, await exportToJson(db), checkInputRules);
    expect(await db.select<Record<string, unknown>>(cols)).toEqual(before);
    db.db.close();
  });

  it("drift tripwire: BACKUP_COLUMNS matches the migrated schema", async () => {
    const db = openMemorySql();
    await migrate(db);
    for (const [table, cols] of Object.entries(BACKUP_COLUMNS)) {
      const info = await db.select<{ name: string }>(
        "SELECT name FROM pragma_table_info(?)",
        [table],
      );
      expect([...cols].sort(), table).toEqual(info.map((c) => c.name).sort());
    }
    db.db.close();
  });
});

describe("mappers — guard corrupt JSON", () => {
  it("rowToScenario throws a clear error on malformed overrides JSON", () => {
    const row: ScenarioRow = {
      id: "s1",
      name: "Broken",
      overrides: "{not valid json",
      created_at: "2026-01-01",
    };
    expect(() => rowToScenario(row)).toThrow(/Corrupt scenario overrides JSON/);
  });

  it("rowToMortgageBlock throws a clear error on malformed draws JSON", () => {
    const row: MortgageBlockRow = {
      id: "m1",
      property_id: "p1",
      start_date: "2026-01-01",
      initial_principal: "1000000",
      fixation_years: 5,
      interest_rate_pa: "0.04",
      monthly_instalment: "5000",
      loan_term_years: 30,
      draws: "[{bad",
      interest_only_until: null,
      contract_maturity_date: null,
      prepayments: null,
      recasts: null,
    };
    expect(() => rowToMortgageBlock(row)).toThrow(
      /Corrupt mortgage draws JSON/,
    );
  });
});
