// App-runtime `Sql` adapter backed by `@tauri-apps/plugin-sql`. Only imported when
// running inside Tauri (never by the Node tests, which use the better-sqlite3 adapter).
// Single statements go through the plugin; transactions, snapshot reads and backups go
// through the app's own Rust commands (src-tauri/src/db.rs, D-14), which borrow the plugin's pool.
import Database from "@tauri-apps/plugin-sql";
import { invoke } from "@tauri-apps/api/core";
import type {
  ExecuteResult,
  Sql,
  SqlStatement,
  TransactionOptions,
} from "./sql";
import { isTauri } from "../lib/tauri";

/**
 * Open (or create) the on-disk SQLite database in the app's config dir and return an
 * `Sql` adapter over it. `migrate`/`seedIfEmpty` can then be run against the result.
 */
export async function openTauriSql(
  connection = "sqlite:portfolio.db",
): Promise<Sql> {
  if (!isTauri()) {
    throw new Error(
      "Tauri runtime not available — open the desktop app, not a browser.",
    );
  }
  const db = await Database.load(connection);
  // FK enforcement needs no PRAGMA here: sqlx turns `foreign_keys` on for every pooled
  // connection it opens (proven in src-tauri/tests/h14_pool_transactions.rs).
  return {
    async execute(
      query: string,
      params: unknown[] = [],
    ): Promise<ExecuteResult> {
      const { rowsAffected } = await db.execute(query, params);
      return { rowsAffected };
    },
    async select<T>(query: string, params: unknown[] = []): Promise<T[]> {
      return db.select<T[]>(query, params);
    },
    async transaction(
      statements: SqlStatement[],
      options: TransactionOptions = {},
    ): Promise<void> {
      await invoke("db_transaction", {
        db: connection,
        statements: statements.map((s) => ({
          query: s.query,
          params: s.params ?? [],
        })),
        foreignKeysOff: options.foreignKeysOff ?? false,
      });
    },
    async selectSnapshot(
      statements: SqlStatement[],
    ): Promise<Record<string, unknown>[][]> {
      return invoke<Record<string, unknown>[][]>("db_select_snapshot", {
        db: connection,
        statements: statements.map((s) => ({
          query: s.query,
          params: s.params ?? [],
        })),
      });
    },
    async backup(label: string): Promise<string> {
      return invoke<string>("db_backup", { db: connection, label });
    },
  };
}
