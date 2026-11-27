// The browser E2E / ux:capture adapter (src/e2e/browserSql.ts) runs the same sql.js WASM
// build in Node; only the Vite `?url` import of the wasm needs a file path instead.
import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";
import { openBrowserSql } from "../../e2e/browserSql";

vi.mock("sql.js/dist/sql-wasm.wasm?url", () => ({
  default: createRequire(import.meta.url).resolve("sql.js/dist/sql-wasm.wasm"),
}));

const one = async (q: string) =>
  (await (await openBrowserSql()).select<{ v: unknown }>(q))[0]?.v;

describe("openBrowserSql", () => {
  it("uses SQLite's standard maths functions, not sql.js's legacy set", async () => {
    // Standard log(X) is base 10; the legacy extension's log(X) is natural.
    expect(await one("SELECT log(100) AS v")).toBe(2);
    expect(await one("SELECT sqrt(4) AS v")).toBe(2);
    // square() exists only in the legacy set.
    await expect(one("SELECT square(3) AS v")).rejects.toThrow(
      /no such function: square/,
    );
  });

  it("executes, selects and enforces foreign keys", async () => {
    const sql = await openBrowserSql();
    await sql.execute("CREATE TABLE p (id INTEGER PRIMARY KEY, name TEXT)");
    await sql.execute(
      "CREATE TABLE c (id INTEGER PRIMARY KEY, p INTEGER REFERENCES p(id))",
    );
    expect(await sql.execute("INSERT INTO p VALUES (?, ?)", [1, "a"])).toEqual({
      rowsAffected: 1,
    });
    expect(await sql.select("SELECT * FROM p WHERE id = ?", [1])).toEqual([
      { id: 1, name: "a" },
    ]);
    // execute throws synchronously; callers await it, so test it as they see it.
    const orphan = async () => sql.execute("INSERT INTO c VALUES (1, 9)");
    await expect(orphan()).rejects.toThrow(/FOREIGN KEY/);
  });

  it("commits a transaction, or rolls all of it back on a failure", async () => {
    const sql = await openBrowserSql();
    await sql.transaction([
      { query: "CREATE TABLE t (id INTEGER PRIMARY KEY); CREATE TABLE u (x);" },
      { query: "INSERT INTO t VALUES (?)", params: [1] },
    ]);
    await expect(
      sql.transaction([
        { query: "INSERT INTO t VALUES (?)", params: [2] },
        { query: "INSERT INTO t VALUES (?)", params: [1] },
      ]),
    ).rejects.toThrow(/UNIQUE/);
    expect(await sql.selectSnapshot([{ query: "SELECT id FROM t" }])).toEqual([
      [{ id: 1 }],
    ]);
    await expect(sql.backup("any")).resolves.toBe(":memory:");
  });
});
