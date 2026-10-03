// P5a: the `Sql.transaction` / `Sql.backup` contract (D-14). The Node adapter mirrors
// src-tauri/src/db.rs, whose own behaviour is proven in src-tauri/tests/db_atomic.rs.
import { describe, it, expect } from "vitest";
import DatabaseConstructor from "better-sqlite3";
import { openMemorySql, type TestSql } from "./betterSqlite";

async function schema(): Promise<TestSql> {
  const sql = openMemorySql();
  await sql.execute(
    "CREATE TABLE p (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE)",
  );
  await sql.execute(
    "CREATE TABLE c (id TEXT PRIMARY KEY, p_id TEXT NOT NULL REFERENCES p(id) ON DELETE CASCADE)",
  );
  return sql;
}

const count = async (sql: TestSql, table: string) =>
  (await sql.select<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`))[0].n;

describe("Sql.transaction", () => {
  it("commits every statement", async () => {
    const sql = await schema();
    await sql.transaction([
      { query: "INSERT INTO p (id, name) VALUES (?, ?)", params: ["a", "A"] },
      { query: "INSERT INTO c (id, p_id) VALUES (?, ?)", params: ["c1", "a"] },
    ]);
    expect(await count(sql, "p")).toBe(1);
    expect(await count(sql, "c")).toBe(1);
  });

  it("keeps nothing when one statement fails", async () => {
    const sql = await schema();
    await expect(
      sql.transaction([
        { query: "INSERT INTO p (id, name) VALUES ('a', 'A')" },
        { query: "INSERT INTO p (id, name) VALUES ('b', 'A')" },
      ]),
    ).rejects.toThrow(/UNIQUE/);
    expect(await count(sql, "p")).toBe(0);
  });

  it("enforces foreign keys", async () => {
    const sql = await schema();
    await expect(
      sql.transaction([
        { query: "INSERT INTO c (id, p_id) VALUES ('c1', 'missing')" },
      ]),
    ).rejects.toThrow(/FOREIGN KEY/);
  });

  it("rebuilds a parent table with FKs off without losing children", async () => {
    const sql = await schema();
    await sql.execute("INSERT INTO p (id, name) VALUES ('a', 'A')");
    await sql.execute("INSERT INTO c (id, p_id) VALUES ('c1', 'a')");
    await sql.transaction(
      [
        {
          query:
            "CREATE TABLE p_new (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE)",
        },
        { query: "INSERT INTO p_new SELECT id, name FROM p" },
        { query: "DROP TABLE p" },
        { query: "ALTER TABLE p_new RENAME TO p" },
      ],
      { foreignKeysOff: true },
    );
    expect(await count(sql, "c")).toBe(1);
    expect(sql.db.pragma("foreign_keys", { simple: true })).toBe(1);
  });

  it("rolls back a rebuild that leaves a dangling reference", async () => {
    const sql = await schema();
    await sql.execute("INSERT INTO p (id, name) VALUES ('a', 'A')");
    await sql.execute("INSERT INTO c (id, p_id) VALUES ('c1', 'a')");
    await expect(
      sql.transaction(
        [
          {
            query:
              "CREATE TABLE p_new (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE)",
          },
          { query: "DROP TABLE p" },
          { query: "ALTER TABLE p_new RENAME TO p" },
        ],
        { foreignKeysOff: true },
      ),
    ).rejects.toThrow(/^FOREIGN_KEY_CHECK_FAILED/);
    expect(await count(sql, "p")).toBe(1);
    expect(sql.db.pragma("foreign_keys", { simple: true })).toBe(1);
  });
});

describe("Sql.backup", () => {
  it("writes a verified, readable copy and never overwrites it", async () => {
    const sql = await schema();
    await sql.execute("INSERT INTO p (id, name) VALUES ('a', 'A')");
    const path = await sql.backup("pre-migration-v1-to-v2-test");
    const copy = new DatabaseConstructor(path, { readonly: true });
    expect(copy.prepare("SELECT COUNT(*) AS n FROM p").get()).toEqual({
      n: 1,
    });
    copy.close();
    await expect(sql.backup("pre-migration-v1-to-v2-test")).rejects.toThrow(
      /^BACKUP_EXISTS/,
    );
  });

  it("rejects a label that is not file-name safe", async () => {
    const sql = await schema();
    await expect(sql.backup("../escape")).rejects.toThrow(
      /invalid backup label/,
    );
  });
});
