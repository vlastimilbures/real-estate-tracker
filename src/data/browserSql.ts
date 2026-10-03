// Browser `Sql` adapter backed by sql.js (WASM SQLite), held entirely in memory.
//
// This is NOT a shipped code path: production runs on Tauri (tauriSql.ts) and the Node
// tests run on better-sqlite3 (betterSqlite.ts). It exists so the React frontend can boot
// in a plain browser for the Playwright smoke test (the desktop WKWebView has no
// Playwright/CDP attach point). It is reached only via the VITE_E2E gate in
// portfolioStore's defaultOpen. Data is ephemeral — fine for a seed-and-drive smoke test.
import initSqlJs, { type Database } from "sql.js";
// Vite serves the wasm asset and gives us its URL; sql.js loads it via locateFile.
import sqlWasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import type { ExecuteResult, Sql, SqlStatement } from "./sql";

export async function openBrowserSql(): Promise<Sql> {
  const SQL = await initSqlJs({ locateFile: () => sqlWasmUrl });
  const db: Database = new SQL.Database();
  db.run("PRAGMA foreign_keys = ON;");
  const sql: Sql = {
    execute(query: string, params: unknown[] = []): Promise<ExecuteResult> {
      db.run(query, params as never[]);
      return Promise.resolve({ rowsAffected: db.getRowsModified() });
    },
    select<T>(query: string, params: unknown[] = []): Promise<T[]> {
      const stmt = db.prepare(query);
      stmt.bind(params as never[]);
      const rows: T[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject() as T);
      stmt.free();
      return Promise.resolve(rows);
    },
    // One synchronous in-memory connection, so BEGIN…COMMIT is atomic here. The FK-off
    // rebuild option is for migrations; the browser DB is always created fresh.
    transaction(statements: SqlStatement[]): Promise<void> {
      db.run("BEGIN");
      try {
        // A parameterless text may hold several statements (a migration, DR-084).
        for (const s of statements) {
          if (s.params?.length) db.run(s.query, s.params as never[]);
          else db.exec(s.query);
        }
        db.run("COMMIT");
      } catch (e) {
        db.run("ROLLBACK");
        return Promise.reject(e instanceof Error ? e : new Error(String(e)));
      }
      return Promise.resolve();
    },
    // One synchronous connection: back-to-back reads already see one state.
    async selectSnapshot(
      statements: SqlStatement[],
    ): Promise<Record<string, unknown>[][]> {
      const out: Record<string, unknown>[][] = [];
      for (const s of statements)
        out.push(await this.select(s.query, s.params));
      return out;
    },
    // Ephemeral E2E database: nothing to protect, so no copy is written.
    backup(): Promise<string> {
      return Promise.resolve(":memory:");
    },
  };
  return sql;
}
