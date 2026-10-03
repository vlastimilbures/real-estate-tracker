// The single seam between the data layer and a concrete SQLite driver.
// Repositories, migrations and the seed depend ONLY on this interface — never on
// `@tauri-apps/plugin-sql` or `better-sqlite3` directly. Two adapters implement it:
//   - tauriSql.ts            → the app runtime (Rust-backed plugin, inside Tauri)
//   - __tests__/betterSqlite → Node/Vitest (better-sqlite3, in-memory)
//
// The shape mirrors `@tauri-apps/plugin-sql`'s Database: `execute` for writes/DDL,
// `select` for reads. Parameters are positional (`?` placeholders).
//
// Atomicity (H-14, D-14): the plugin runs each call on any pooled connection, so a
// `BEGIN` sent through `execute` is NOT a transaction. Every write of more than one
// statement goes through `transaction`, which runs the whole list on one connection:
// all statements commit, or none does.

/** One parameterised statement. */
export interface SqlStatement {
  query: string;
  params?: unknown[];
}

export interface TransactionOptions {
  /** Table-rebuild migrations only: FK enforcement is off for this transaction, and
   *  `PRAGMA foreign_key_check` must pass before it commits. */
  foreignKeysOff?: boolean;
}

/** What a single write changed (mirrors the plugin's QueryResult). */
export interface ExecuteResult {
  rowsAffected: number;
}

export interface Sql {
  execute(query: string, params?: unknown[]): Promise<ExecuteResult>;
  select<T = Record<string, unknown>>(
    query: string,
    params?: unknown[],
  ): Promise<T[]>;
  /** Run `statements` atomically, in order. Rejects (and keeps nothing) on any error. */
  transaction(
    statements: SqlStatement[],
    options?: TransactionOptions,
  ): Promise<void>;
  /** Run the read-only `statements` as one point-in-time snapshot: one row list per
   *  statement, in order, all from the same database state (DR-134). Separate `select`
   *  calls can land on different pooled connections between writes. */
  selectSnapshot(
    statements: SqlStatement[],
  ): Promise<Record<string, unknown>[][]>;
  /** Write a verified copy of the database named by `label` ([A-Za-z0-9-] only) and
   *  return where it went. Used before every migration (P5a). */
  backup(label: string): Promise<string>;
}
