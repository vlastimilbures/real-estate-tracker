// Backup round-trip test: export → restore produces identical data + identical engine output.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { openMemorySql, type TestSql } from "./betterSqlite";
import { migrate } from "../migrations";
import { seedIfEmpty } from "../seed";
import { loadPortfolio, loadAssumptions } from "../repositories";
import {
  exportToJson,
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
    const db = await freshSeeded();
    const good = await exportToJson(db);
    const before = await rowCounts(db);
    const strip = (rows: Record<string, unknown>[], cols: string[]) =>
      rows.map((r) =>
        Object.fromEntries(
          Object.entries(r).filter(([k]) => !cols.includes(k)),
        ),
      );
    const old = {
      ...good,
      tables: {
        ...good.tables,
        properties: strip(good.tables.properties, ["active"]),
        mortgage_blocks: strip(good.tables.mortgage_blocks, [
          "loan_term_years",
          "draws",
          "interest_only_until",
          "prepayments",
          "recasts",
        ]),
      },
    };
    await restoreFromJson(db, old, checkInputRules);
    expect(await rowCounts(db)).toEqual(before);
    // A backup from before v9 restores with no prepayments or recasts (ADR 0109).
    const events = await db.select<{ prepayments: null; recasts: null }>(
      "SELECT prepayments, recasts FROM mortgage_blocks",
    );
    expect(
      events.every((e) => e.prepayments === null && e.recasts === null),
    ).toBe(true);
    const props = await db.select<{ active: number }>(
      "SELECT active FROM properties",
    );
    expect(props).toHaveLength(3);
    expect(props.every((p) => p.active === 1)).toBe(true);
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
