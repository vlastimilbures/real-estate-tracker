// The app's own database commands (src-tauri/src/db.rs, ADR 0014): one statement
// (ADR 0270), a transaction, a snapshot read and a file backup. Rust runs them on the SQL
// plugin's pool for the app's one database (`DB_URL`), so they see the same database as
// tauriSql's reads.
import { call } from "./commands";

/** A statement as the data layer holds it; the wire always carries a params list. */
interface Statement {
  query: string;
  params?: unknown[];
}

const wireOne = (s: Statement) => ({ query: s.query, params: s.params ?? [] });

function wire(statements: Statement[]) {
  return statements.map(wireOne);
}

/** Run one statement; resolves to the rows it changed. */
export function dbExecute(
  statement: Statement,
): Promise<{ rowsAffected: number }> {
  return call("db_execute", wireOne(statement));
}

/** Run every statement in one transaction; any failure rolls all of them back. */
export function dbTransaction(statements: Statement[]): Promise<void> {
  return call("db_transaction", { statements: wire(statements) });
}

/** Run the reads in one transaction, so they see one state of the data. */
export function dbSelectSnapshot(
  statements: Statement[],
): Promise<Record<string, unknown>[][]> {
  return call("db_select_snapshot", { statements: wire(statements) });
}

/** Copy the database file next to it; resolves to the copy's file name. */
export function dbBackup(label: string): Promise<string> {
  return call("db_backup", { label });
}
