// Versioned backups and the all-or-nothing restore (P5b): the whole file is checked
// before anything is touched, older backups are upgraded in memory, newer ones are
// refused, and the replacement is one transaction (DR-019, DR-038, D-54).
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { openMemorySql, type TestSql } from "./betterSqlite";
import { MIGRATIONS, migrate } from "../migrations";
import { seedIfEmpty } from "../seed";
import {
  BACKUP_MAX_BYTES,
  exportToJson,
  parseBackupText,
  restoreFromJson,
  RestoreError,
  validateBackup,
  type BackupFile,
} from "../backup";
import { checkInputRules } from "../../import/inputRules";
import type { Sql } from "../sql";

const HEAD = Math.max(...MIGRATIONS.map((m) => m.version));

let sql: TestSql;

beforeEach(async () => {
  sql = openMemorySql();
  await migrate(sql);
  await seedIfEmpty(sql);
});

afterEach(() => sql.db.close());

function dump(s: TestSql) {
  const out: Record<string, unknown[]> = {};
  for (const t of [
    "properties",
    "mortgage_blocks",
    "valuations",
    "leases",
    "holding_costs",
    "assumptions",
    "scenarios",
  ])
    out[t] = s.db.prepare(`SELECT * FROM ${t} ORDER BY id`).all();
  return out;
}

type Rows = Record<string, unknown>[];

/** The seeded backup with one table's rows edited. */
async function edited(
  table: string,
  edit: (rows: Rows) => Rows,
): Promise<BackupFile> {
  const b = await exportToJson(sql);
  const rows = (b.tables[table] as Rows).map((r) => ({ ...r }));
  return { ...b, tables: { ...b.tables, [table]: edit(rows) } };
}

async function rejection(p: Promise<unknown>): Promise<RestoreError> {
  const e = await p.then(
    () => null,
    (err: unknown) => err,
  );
  expect(e).toBeInstanceOf(RestoreError);
  return e as RestoreError;
}

describe("backup version (DR-038)", () => {
  it("a backup carries the database schema version", async () => {
    expect((await exportToJson(sql)).schemaVersion).toBe(HEAD);
  });

  it("refuses a backup from a newer app version before touching anything", async () => {
    const b = { ...(await exportToJson(sql)), schemaVersion: HEAD + 1 };
    const e = await rejection(Promise.resolve().then(() => validateBackup(b)));
    expect(e.code).toBe("BACKUP_NEWER");
  });

  it("accepts every older version, including the legacy constant 1", async () => {
    const b = await exportToJson(sql);
    for (let v = 1; v <= HEAD; v++)
      expect(validateBackup({ ...b, schemaVersion: v }).schemaVersion).toBe(v);
  });
});

describe("parseBackupText", () => {
  it("refuses a file over 20 MB before parsing it (D-53)", () => {
    expect(() => parseBackupText(" ".repeat(BACKUP_MAX_BYTES + 1))).toThrow(
      expect.objectContaining({ code: "BACKUP_TOO_LARGE" }),
    );
  });

  it("refuses text that is not JSON", () => {
    expect(() => parseBackupText("{not json")).toThrow(
      expect.objectContaining({ code: "BACKUP_NOT_JSON" }),
    );
  });
});

describe("restore checks every row before touching the DB (DR-019)", () => {
  it("an unreadable value", async () => {
    const before = dump(sql);
    const bad = await edited("valuations", (rows) => {
      rows[0].market_value = "abc";
      return rows;
    });
    const e = await rejection(restoreFromJson(sql, bad, checkInputRules));
    expect(e.code).toBe("BACKUP_ROWS_INVALID");
    expect(e.issues).toEqual([
      expect.objectContaining({
        table: "valuations",
        id: bad.tables.valuations[0].id,
        rule: "UNREADABLE_VALUE",
      }),
    ]);
    expect(dump(sql)).toEqual(before);
  });

  it("an engine input rule (D-17) and a holding-cost share above 1 (D-54)", async () => {
    const before = dump(sql);
    const b = await exportToJson(sql);
    const mortgages = (b.tables.mortgage_blocks as Rows).map((r) => ({ ...r }));
    mortgages[0].monthly_instalment = "1";
    const costs = (b.tables.holding_costs as Rows).map((r) => ({ ...r }));
    costs[0].mgmt_pct_rent = "1.5";
    const bad = {
      ...b,
      tables: { ...b.tables, mortgage_blocks: mortgages, holding_costs: costs },
    };
    const e = await rejection(restoreFromJson(sql, bad, checkInputRules));
    expect(e.issues).toEqual([
      {
        table: "mortgage_blocks",
        id: mortgages[0].id,
        column: "monthly_instalment",
        rule: "INSTALMENT_BELOW_INTEREST",
      },
      {
        table: "holding_costs",
        id: costs[0].id,
        column: "mgmt_pct_rent",
        rule: "RATE_OUT_OF_RANGE",
      },
    ]);
    expect(dump(sql)).toEqual(before);
  });

  it("a duplicate natural key", async () => {
    const before = dump(sql);
    const bad = await edited("valuations", (rows) => [
      ...rows,
      { ...rows[0], id: "dup" },
    ]);
    const e = await rejection(restoreFromJson(sql, bad, checkInputRules));
    expect(e.issues).toEqual([
      {
        table: "valuations",
        id: "dup",
        column: "property_id, valid_from",
        rule: "DUPLICATE_KEY",
      },
    ]);
    expect(dump(sql)).toEqual(before);
  });

  // ADR 0086 (#38): the form and CSV whole-number bounds apply to restore too.
  it.each([
    ["assumptions", "horizon_years", 101, 100, { min: 1, max: 100 }],
    ["mortgage_blocks", "fixation_years", 51, 50, { min: 0, max: 50 }],
    ["mortgage_blocks", "loan_term_years", 51, 50, { min: 1, max: 50 }],
    ["properties", "size_m2", 10_001, 10_000, { min: 1, max: 10_000 }],
  ])("%s.%s outside its range", async (table, column, out, edge, range) => {
    const before = dump(sql);
    const set = (n: number) =>
      edited(table, (rows) => {
        rows[0][column] = n;
        return rows;
      });
    const bad = await set(out);
    const e = await rejection(restoreFromJson(sql, bad, checkInputRules));
    expect(e.code).toBe("BACKUP_ROWS_INVALID");
    expect(e.issues).toEqual([
      {
        table,
        ...(table !== "assumptions" && { id: bad.tables[table][0].id }),
        column,
        rule: "OUT_OF_RANGE",
        range,
      },
    ]);
    expect(dump(sql)).toEqual(before);

    await restoreFromJson(sql, await set(edge), checkInputRules);
    const id = bad.tables[table][0].id;
    expect(
      sql.db
        .prepare(`SELECT ${column} AS v FROM ${table} WHERE id = ?`)
        .get(id),
    ).toEqual({ v: edge });
  });

  it("a missing assumptions row", async () => {
    const e = await rejection(
      restoreFromJson(
        sql,
        await edited("assumptions", () => []),
        checkInputRules,
      ),
    );
    expect(e.issues).toEqual([
      { table: "assumptions", rule: "MISSING_ASSUMPTIONS" },
    ]);
  });
});

describe("restore is one transaction", () => {
  it("a failure inside the write keeps the current data", async () => {
    const before = dump(sql);
    const statements: string[] = [];
    const failing: Sql = {
      ...sql,
      execute: (q, p) => {
        statements.push(q);
        return sql.execute(q, p);
      },
      transaction: (stmts, o) =>
        sql.transaction(
          [...stmts, { query: "INSERT INTO no_such_table VALUES (1)" }],
          o,
        ),
    };
    const b = await exportToJson(sql);
    await expect(restoreFromJson(failing, b, checkInputRules)).rejects.toThrow(
      /no_such_table/,
    );
    expect(statements).toEqual([]); // nothing outside the transaction
    expect(dump(sql)).toEqual(before);
  });
});

describe("older backups are upgraded in memory", () => {
  it("restores a legacy v1 file: missing columns, flat valueShockPct", async () => {
    const b = await exportToJson(sql);
    const strip = (rows: Rows, cols: string[]) =>
      rows.map((r) =>
        Object.fromEntries(
          Object.entries(r).filter(([k]) => !cols.includes(k)),
        ),
      );
    const legacy: BackupFile = {
      schemaVersion: 1,
      exportedAt: "2025-01-01T00:00:00.000Z",
      tables: {
        ...b.tables,
        properties: strip(b.tables.properties as Rows, ["active"]),
        mortgage_blocks: strip(b.tables.mortgage_blocks as Rows, [
          "loan_term_years",
          "draws",
          "interest_only_until",
          "contract_maturity_date",
        ]),
        scenarios: [
          {
            id: "s-old",
            name: "Crash",
            overrides: '{"valueShockPct":"0.2"}',
            created_at: "2025-01-01",
          },
        ],
      },
    };
    await restoreFromJson(sql, legacy, checkInputRules);
    expect(
      sql.db.prepare("SELECT DISTINCT active FROM properties").all(),
    ).toEqual([{ active: 1 }]);
    expect(sql.db.prepare("SELECT overrides FROM scenarios").get()).toEqual({
      overrides: '{"version":1,"valueShock":{"pct":"0.2","atYear":0}}',
    });
  });
});
