// ADR 0230: the schema starts at version 8. A new install creates version 8 in one step
// and ends at the same schema as before the baseline; a version 8 database upgrades to
// head as before; a database below version 8 is refused and not modified, byte for byte.
import { describe, it, expect, afterEach } from "vitest";
import DatabaseConstructor from "better-sqlite3";
import type { Database } from "better-sqlite3";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openMemorySql, type TestSql } from "./betterSqlite";
import { BASELINE, migrate, SCHEMA_HEAD } from "../migrations";
import { DataError } from "../errors";
import { en } from "../../i18n/en";
import { listScenarios, loadAssumptions, loadPortfolio } from "./support/reads";

/** The fresh-install schema and steps before the baseline (captured on b0fa0bae). */
const FRESH = JSON.parse(
  readFileSync(
    join(__dirname, "fixtures", "fresh-install-schema.json"),
    "utf8",
  ),
) as {
  sqliteMaster: Record<string, unknown>[];
  schemaMigrations: { version: number; name: string }[];
};

const NOW = () => new Date(Date.UTC(2026, 9, 1, 7, 35, 12));

const TABLES = [
  "properties",
  "mortgage_blocks",
  "valuations",
  "leases",
  "holding_costs",
  "assumptions",
  "scenarios",
];

/** A database as an app of `version` (7 or 8) left it: the v7 and v8 schemas are the same,
 *  v8 only rewrote the scenario JSON (the legacy flat spelling before it). */
function writeDatabaseAt(db: Database, version: 7 | 8): void {
  db.exec(
    "CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)",
  );
  db.exec(BASELINE.sql);
  const step = db.prepare(
    "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, '1970-01-01T00:00:00.000Z')",
  );
  for (const s of BASELINE.steps.filter((s) => s.version <= version))
    step.run(s.version, s.name);
  db.exec(`
    INSERT INTO app_meta (key, value) VALUES ('sample_seeded', '1');
    INSERT INTO properties (id, name, address, type, size_m2, garage, purchase_date, purchase_price, appreciation_override_pa) VALUES ('p1', 'Flat One', 'Street 1', '2+kk', 55, 1, '2023-02-01', '7500000.50', '0.03');
    INSERT INTO properties (id, name, purchase_date, purchase_price, active) VALUES ('p2', 'Flat Two', '2024-05-10', '4200000', 0);
    INSERT INTO mortgage_blocks (id, property_id, start_date, initial_principal, fixation_years, interest_rate_pa, monthly_instalment, loan_term_years, draws, contract_maturity_date) VALUES ('m1', 'p1', '2023-02-01', '5000000', 5, '0.0449', '21576.4', 30, '[{"date":"2023-02-01","amount":"5000000"}]', '2053-02-01');
    INSERT INTO valuations (id, property_id, valid_from, valid_to, market_value) VALUES ('v1', 'p1', '2023-02-01', '2025-12-31', '7600000'), ('v2', 'p1', '2026-01-01', NULL, '8100000');
    INSERT INTO leases (id, property_id, start_date, end_date, monthly_rent) VALUES ('l1', 'p1', '2023-03-01', '2024-02-29', '22000'), ('l2', 'p1', '2024-03-01', NULL, '23500');
    INSERT INTO holding_costs (id, property_id, property_tax_yr, mgmt_pct_rent) VALUES ('hc-p1', 'p1', '2400', '0.05'), ('hc-p2', 'p2', NULL, NULL);
    INSERT INTO assumptions VALUES (1, '2026-06-07', '0.03', '0.025', '0.04', '0.055', 30, '0.025', '2000', '3000', '0.0', '0.05', '1500', '0');
  `);
  db.prepare(
    "INSERT INTO scenarios (id, name, overrides, created_at) VALUES ('s1', 'Stress', ?, '2026-01-05')",
  ).run(
    version === 8
      ? '{"version":1,"appreciationPa":"0.01"}'
      : '{"appreciationPa":"0.01"}',
  );
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

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("the schema starts at version 8 (ADR 0230)", () => {
  it("a fresh install ends at the same schema and steps as before the baseline", async () => {
    const sql = openMemorySql();
    const result = await migrate(sql, { now: NOW });

    expect(result).toEqual({ from: 0, to: SCHEMA_HEAD, backupPath: null });
    // Byte for byte: every table and index text as a fresh install wrote it before.
    expect(
      sql.db
        .prepare(
          "SELECT type, name, tbl_name, sql FROM sqlite_master ORDER BY name",
        )
        .all(),
    ).toEqual(FRESH.sqliteMaster);
    expect(
      sql.db
        .prepare(
          "SELECT version, name, applied_at FROM schema_migrations ORDER BY version",
        )
        .all(),
    ).toEqual(
      FRESH.schemaMigrations.map((m) => ({
        ...m,
        applied_at: "2026-10-01T07:35:12.000Z",
      })),
    );
    sql.db.close();
  });

  it("a version 8 database upgrades to the latest, data kept, verified copy first", async () => {
    const sql = openMemorySql();
    writeDatabaseAt(sql.db, 8);
    const before = tableRows(sql);

    const result = await migrate(sql, { now: NOW });

    expect(result.from).toBe(8);
    expect(result.to).toBe(SCHEMA_HEAD);
    expect(result.backupPath).toMatch(
      new RegExp(
        `pre-migration-v8-to-v${SCHEMA_HEAD}-20261001T073512Z\\.sqlite$`,
      ),
    );
    const versions = await sql.select<{ version: number }>(
      "SELECT version FROM schema_migrations ORDER BY version",
    );
    expect(versions.map((v) => v.version)).toEqual(
      FRESH.schemaMigrations.map((m) => m.version),
    );
    const after = tableRows(sql);
    for (const t of TABLES) {
      expect(after[t], t).toHaveLength(before[t].length);
      after[t].forEach((row, i) =>
        expect(row, `${t}[${i}]`).toMatchObject(
          before[t][i] as Record<string, unknown>,
        ),
      );
    }
    expect((await loadPortfolio(sql)).properties).toHaveLength(2);
    await loadAssumptions(sql);
    expect(
      sql.db.prepare("SELECT selling_cost_pct FROM assumptions").get(),
    ).toEqual({ selling_cost_pct: "0" });
    expect(await listScenarios(sql)).toHaveLength(1);
    const copy = new DatabaseConstructor(result.backupPath!, {
      readonly: true,
    });
    expect(
      copy.prepare("SELECT MAX(version) AS v FROM schema_migrations").get(),
    ).toEqual({ v: 8 });
    copy.close();
    sql.db.close();
  });

  it("a version 7 database is refused with the message and stays byte-for-byte unchanged", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ret-test-baseline-"));
    dirs.push(dir);
    const file = join(dir, "portfolio.db");
    const setup = new DatabaseConstructor(file);
    writeDatabaseAt(setup, 7);
    setup.close();
    const bytes = readFileSync(file);

    const sql = openMemorySql(file);
    const backups: string[] = [];
    sql.backup = (label) => {
      backups.push(label);
      return Promise.reject(new Error("no backup expected"));
    };
    const e = await rejection(migrate(sql, { now: NOW }));
    sql.db.close();

    expect(e.code).toBe("DB_TOO_OLD");
    expect(e.details).toEqual([]);
    expect(en.dataErrors.DB_TOO_OLD).toBe(
      "This database was last opened with a version older than 1.4.0. Open it once with version 1.5.0, then update.",
    );
    expect(backups).toEqual([]);
    expect(Buffer.compare(readFileSync(file), bytes)).toBe(0);
    expect(existsSync(`${file}-journal`)).toBe(false);
    expect(existsSync(`${file}-wal`)).toBe(false);
  });
});
