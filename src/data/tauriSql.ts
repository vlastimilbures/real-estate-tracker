// App-runtime `Sql` adapter backed by `@tauri-apps/plugin-sql`. Only imported when
// running inside Tauri (never by the Node tests, which use the better-sqlite3 adapter).
// Single statements go through the plugin; transactions, snapshot reads and backups go
// through the app's own Rust commands (src-tauri/src/db.rs, ADR 0014), which borrow the
// plugin's pool.
import Database from "@tauri-apps/plugin-sql";
import type { ExecuteResult, Sql, SqlStatement } from "./sql";
import { isTauri } from "../lib/tauri";
import {
  dbBackup,
  dbSelectSnapshot,
  dbTransaction,
} from "../platform/dbCommands";

/** Transaction control. Each `execute` may run on another pooled connection, so these sent
 *  as separate calls would not make the statements between them atomic. */
const TRANSACTION_CONTROL =
  /^\s*(BEGIN|COMMIT|END|ROLLBACK|SAVEPOINT|RELEASE)\b/i;

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
      // A tripwire for a mistake, not a guard: a leading comment slips past it.
      // Multi-step writes go through `transaction` (ADR 0014, ADR 0175).
      if (TRANSACTION_CONTROL.test(query))
        throw new Error(
          "execute refuses transaction control; use transaction() for multi-step writes",
        );
      const { rowsAffected } = await db.execute(query, params);
      return { rowsAffected };
    },
    async select<T>(query: string, params: unknown[] = []): Promise<T[]> {
      return db.select<T[]>(query, params);
    },
    async transaction(statements: SqlStatement[]): Promise<void> {
      await dbTransaction(connection, statements);
    },
    async selectSnapshot(
      statements: SqlStatement[],
    ): Promise<Record<string, unknown>[][]> {
      return dbSelectSnapshot(connection, statements);
    },
    async backup(label: string): Promise<string> {
      return dbBackup(connection, label);
    },
  };
}
