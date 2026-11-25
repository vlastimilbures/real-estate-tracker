// #470: the schema description (src/data/schema.ts) is the one place a column, unique key
// or CHECK is described. This drift test pins it to a freshly migrated database, so a
// column added to the description alone fails until its migration exists, and a migration
// alone fails until the description has it.
import { describe, it, expect } from "vitest";
import { openMemorySql, type TestSql } from "./betterSqlite";
import { migrate } from "../migrations";
import {
  TABLES,
  columnNames,
  restoreDefaults,
  type TableSpec,
} from "../schema";
import { BACKUP_COLUMNS } from "../backup";
import { CHECK_CONSTRAINTS } from "../../lib/checkConstraints";
import { schemaAt } from "./support/schemaAt";

type Tables = Readonly<Record<string, TableSpec>>;

/** Tables the description leaves out on purpose: not portfolio data, never backed up. */
const UNDESCRIBED = ["app_meta", "schema_migrations"];

const sqlType = (kind: string) =>
  kind === "int" || kind === "flag" ? "INTEGER" : "TEXT";
const sqlLiteral = (v: string | number | undefined) =>
  v === undefined ? null : typeof v === "string" ? `'${v}'` : String(v);

interface ColumnInfo {
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

async function columnDrift(
  db: TestSql,
  table: string,
  spec: TableSpec,
): Promise<string[]> {
  const info = await db.select<ColumnInfo>(
    'SELECT name, type, "notnull", dflt_value, pk FROM pragma_table_info(?) ORDER BY cid',
    [table],
  );
  const have = info.map((c) => ({
    name: c.name,
    type: c.type,
    // A TEXT primary key may be NULL in SQLite; the description calls `id` required.
    notnull: c.pk ? "pk" : c.notnull ? "NOT NULL" : "NULL",
    dflt: c.dflt_value,
  }));
  const want = spec.columns.map((c) => ({
    name: c.name,
    type: sqlType(c.kind),
    notnull: c.name === "id" ? "pk" : c.nullable ? "NULL" : "NOT NULL",
    dflt: sqlLiteral(c.restoreDefault),
  }));
  return JSON.stringify(have) === JSON.stringify(want)
    ? []
    : [
        `${table} columns: database ${JSON.stringify(have)}, description ${JSON.stringify(want)}`,
      ];
}

async function uniqueDrift(
  db: TestSql,
  table: string,
  spec: TableSpec,
): Promise<string[]> {
  const indexes = await db.select<{
    name: string;
    unique: number;
    origin: string;
  }>('SELECT name, "unique", origin FROM pragma_index_list(?)', [table]);
  const keys: string[] = [];
  for (const ix of indexes) {
    if (ix.origin === "pk") continue;
    const cols = await db.select<{ name: string }>(
      "SELECT name FROM pragma_index_info(?) ORDER BY seqno",
      [ix.name],
    );
    keys.push(
      `${ix.unique ? "UNIQUE" : "INDEX"} (${cols.map((c) => c.name).join(", ")})`,
    );
  }
  const have = keys.sort();
  const want = spec.unique.map((u) => `UNIQUE (${u.join(", ")})`).sort();
  return JSON.stringify(have) === JSON.stringify(want)
    ? []
    : [
        `${table} keys: database ${JSON.stringify(have)}, description ${JSON.stringify(want)}`,
      ];
}

async function checkDrift(
  db: TestSql,
  table: string,
  spec: TableSpec,
): Promise<string[]> {
  const [row] = await db.select<{ sql: string }>(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?",
    [table],
  );
  const have = [...(row?.sql ?? "").matchAll(/CONSTRAINT (\w+) CHECK/g)]
    .map((m) => m[1] ?? "")
    .sort();
  const want = [...spec.checks].sort();
  return JSON.stringify(have) === JSON.stringify(want)
    ? []
    : [
        `${table} checks: database ${JSON.stringify(have)}, description ${JSON.stringify(want)}`,
      ];
}

/** Every difference between `tables` and the migrated database `db`. */
async function schemaDrift(db: TestSql, tables: Tables): Promise<string[]> {
  const out: string[] = [];
  const stored = await db.select<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
  );
  const names = stored
    .map((r) => r.name)
    .filter((n) => !UNDESCRIBED.includes(n));
  const described = Object.keys(tables).sort();
  if (JSON.stringify(names) !== JSON.stringify(described))
    out.push(
      `tables: database ${JSON.stringify(names)}, description ${JSON.stringify(described)}`,
    );
  for (const [table, spec] of Object.entries(tables))
    out.push(
      ...(await columnDrift(db, table, spec)),
      ...(await uniqueDrift(db, table, spec)),
      ...(await checkDrift(db, table, spec)),
    );
  return out;
}

async function migrated(): Promise<TestSql> {
  const db = openMemorySql();
  await migrate(db);
  return db;
}

/** The description with one more column on `leases`, as a new migration would add it. */
const withTestColumn = (): Tables => ({
  ...TABLES,
  leases: {
    ...TABLES.leases,
    columns: [
      ...TABLES.leases.columns,
      { name: "test_note", kind: "text", nullable: true, addedIn: 12 },
    ],
  },
});

describe("schema description (#470)", () => {
  it("matches the migrated database: columns, types, NOT NULL, defaults, unique keys, checks", async () => {
    const db = await migrated();
    expect(await schemaDrift(db, TABLES)).toEqual([]);
    db.db.close();
  });

  it("a column added to the description alone fails the drift test", async () => {
    const db = await migrated();
    const drift = await schemaDrift(db, withTestColumn());
    expect(drift).toHaveLength(1);
    expect(drift[0]).toMatch(/^leases columns: .*"test_note"/);
    db.db.close();
  });

  it("a unique key or check the database lacks fails the drift test", async () => {
    const db = await migrated();
    const tables: Tables = {
      ...TABLES,
      scenarios: { ...TABLES.scenarios, unique: [["name"]], checks: [] },
    };
    const drift = await schemaDrift(db, tables);
    expect(drift).toEqual([
      expect.stringMatching(/^scenarios keys: /),
      expect.stringMatching(/^scenarios checks: /),
    ]);
    db.db.close();
  });

  it("a column added to the description reaches backup and restore with nothing else edited", () => {
    const tables = withTestColumn();
    expect(columnNames(tables).leases).toEqual([
      ...BACKUP_COLUMNS.leases,
      "test_note",
    ]);
    // Nullable and without a default: an older backup restores it as NULL.
    expect(restoreDefaults(tables)).toEqual(restoreDefaults(TABLES));
  });

  it("each column's addedIn is the migration that added it", async () => {
    for (const [table, spec] of Object.entries(TABLES))
      for (const c of spec.columns) {
        const at = async (v: number) => {
          const db = await schemaAt(v);
          const cols = await db.select<{ name: string }>(
            "SELECT name FROM pragma_table_info(?)",
            [table],
          );
          db.db.close();
          return cols.some((x) => x.name === c.name);
        };
        expect(await at(c.addedIn), `${table}.${c.name} at v${c.addedIn}`).toBe(
          true,
        );
        if (c.addedIn > 1)
          expect(
            await at(c.addedIn - 1),
            `${table}.${c.name} before v${c.addedIn}`,
          ).toBe(false);
      }
  });

  it("restore defaults: only properties.active and assumptions.selling_cost_pct", () => {
    expect(restoreDefaults(TABLES)).toEqual({
      "properties.active": 1,
      "assumptions.selling_cost_pct": "0",
    });
  });

  it("names every CHECK constraint once, on a described table", () => {
    const names = CHECK_CONSTRAINTS.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
    for (const c of CHECK_CONSTRAINTS)
      expect(Object.keys(TABLES)).toContain(c.table);
  });
});
