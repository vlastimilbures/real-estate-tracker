// Node/Vitest `Sql` adapter backed by better-sqlite3 (in-memory by default). This is
// the TEST seam only — the shipped app uses tauriSql.ts. better-sqlite3 is a
// devDependency; importing it here keeps it out of the app bundle.
//
// The driver is synchronous; we wrap each call in a resolved Promise to satisfy the
// async `Sql` interface. Positional `?` parameters map 1:1 to better-sqlite3.
// `transaction` and `backup` mirror src-tauri/src/db.rs (D-14): one transaction, same
// verification of the copy. A write, a snapshot or a backup fails as Rust's commands do
// (ADR 0270 point 5): a CommandError with Rust's code, and for a constraint failure the
// fields Rust reads from SQLite's extended code and message. `select` stays the driver's
// own error, as the app's reads stay on the SQL plugin.
import DatabaseConstructor from "better-sqlite3";
import type { Database } from "better-sqlite3";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExecuteResult, Sql, SqlStatement } from "../sql";
import {
  CommandError,
  type ConstraintFailure,
} from "../../platform/commandError";

export interface TestSql extends Sql {
  /** The underlying handle, for closing in afterAll. */
  readonly db: Database;
}

function tableCounts(db: Database): [string, number][] {
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all() as { name: string }[];
  return tables.map(({ name }) => [
    name,
    (
      db.prepare(`SELECT COUNT(*) AS n FROM "${name}"`).get() as {
        n: number;
      }
    ).n,
  ]);
}

/** `t.a, t.b` → table `t`, columns `a`, `b` (src-tauri/src/error.rs `table_columns`). */
function tableColumns(
  list: string,
): { table: string; columns: string[] } | null {
  const items = list.split(", ").map((i) => /^(\w+)\.(\w+)$/.exec(i));
  if (items.some((m) => !m)) return null;
  const pairs = items.map((m) => [m?.[1] ?? "", m?.[2] ?? ""] as const);
  return { table: pairs[0]?.[0] ?? "", columns: pairs.map(([, c]) => c) };
}

/** The constraint behind better-sqlite3's `SQLITE_CONSTRAINT_*` code, named from
 *  SQLite's message, as Rust's `Constraint::from_sqlite` names it. */
function constraintFrom(
  code: string,
  message: string,
): ConstraintFailure | undefined {
  const after = (prefix: string) =>
    message.startsWith(prefix) ? message.slice(prefix.length) : null;
  switch (code) {
    case "SQLITE_CONSTRAINT_UNIQUE":
    case "SQLITE_CONSTRAINT_PRIMARYKEY": {
      const named = tableColumns(after("UNIQUE constraint failed: ") ?? "");
      return named ? { kind: "unique", ...named } : undefined;
    }
    case "SQLITE_CONSTRAINT_NOTNULL": {
      const named = tableColumns(after("NOT NULL constraint failed: ") ?? "");
      return named ? { kind: "notNull", ...named } : undefined;
    }
    case "SQLITE_CONSTRAINT_CHECK": {
      const check = /^\w+/.exec(after("CHECK constraint failed: ") ?? "")?.[0];
      return check ? { kind: "check", check } : undefined;
    }
    case "SQLITE_CONSTRAINT_FOREIGNKEY":
      return { kind: "foreignKey" };
    default:
      return undefined;
  }
}

/** SQLite's (extended) result codes by better-sqlite3's name, for the detail sqlx
 *  writes: the ones a test can meet. A name not listed keeps SQLite's bare message. */
const RESULT_CODES: Readonly<Record<string, number>> = {
  SQLITE_ERROR: 1,
  SQLITE_BUSY: 5,
  SQLITE_READONLY: 8,
  SQLITE_CONSTRAINT: 19,
  SQLITE_MISMATCH: 20,
  SQLITE_RANGE: 25,
  SQLITE_CONSTRAINT_CHECK: 275,
  SQLITE_CONSTRAINT_FOREIGNKEY: 787,
  SQLITE_CONSTRAINT_NOTNULL: 1299,
  SQLITE_CONSTRAINT_PRIMARYKEY: 1555,
  SQLITE_CONSTRAINT_UNIQUE: 2067,
};

/** A driver failure as Rust's commands reject: code SQL, sqlx's text as the detail
 *  (`error returned from database: (code: N) <SQLite's message>`), the constraint. */
function asRust(e: unknown): Error {
  if (!(e instanceof Error)) return new Error(String(e));
  const code = (e as Error & { code?: unknown }).code;
  if (typeof code !== "string" || !code.startsWith("SQLITE_")) return e;
  const n = RESULT_CODES[code];
  const detail =
    n === undefined
      ? e.message
      : `error returned from database: (code: ${n}) ${e.message}`;
  return new CommandError("SQL", detail, constraintFrom(code, e.message));
}

export function openMemorySql(filename = ":memory:"): TestSql {
  const db = new DatabaseConstructor(filename);
  db.pragma("foreign_keys = ON");
  let backupDir: string | null = null;
  return {
    db,
    // async: a driver error is a rejection, as with the Tauri plugin.
    async execute(
      query: string,
      params: unknown[] = [],
    ): Promise<ExecuteResult> {
      try {
        const { changes } = db.prepare(query).run(...(params as never[]));
        return { rowsAffected: changes };
      } catch (e) {
        throw asRust(e);
      }
    },
    async select<T>(query: string, params: unknown[] = []): Promise<T[]> {
      return db.prepare(query).all(...(params as never[])) as T[];
    },
    // As src-tauri/src/db.rs select_snapshot: every read inside one transaction.
    selectSnapshot(
      statements: SqlStatement[],
    ): Promise<Record<string, unknown>[][]> {
      try {
        return Promise.resolve(
          db.transaction(() =>
            statements.map(
              (s) =>
                db
                  .prepare(s.query)
                  .all(...((s.params ?? []) as never[])) as Record<
                  string,
                  unknown
                >[],
            ),
          )(),
        );
      } catch (e) {
        return Promise.reject(asRust(e));
      }
    },
    transaction(statements: SqlStatement[]): Promise<void> {
      try {
        db.transaction(() => {
          for (const s of statements) {
            // A parameterless text may hold several statements (a migration, DR-084).
            if (s.params?.length)
              db.prepare(s.query).run(...(s.params as never[]));
            else db.exec(s.query);
          }
        })();
        return Promise.resolve();
      } catch (e) {
        return Promise.reject(asRust(e));
      }
    },
    backup(label: string): Promise<string> {
      if (!/^[A-Za-z0-9-]{1,100}$/.test(label)) {
        return Promise.reject(
          new CommandError("INVALID_LABEL", `invalid backup label: ${label}`),
        );
      }
      backupDir ??= mkdtempSync(join(tmpdir(), "ret-test-backup-"));
      const dest = join(backupDir, `${label}.sqlite`);
      if (existsSync(dest)) {
        return Promise.reject(
          new CommandError("BACKUP_EXISTS", `BACKUP_EXISTS: ${dest}`),
        );
      }
      db.prepare("VACUUM INTO ?").run(dest);
      const copy = new DatabaseConstructor(dest, { readonly: true });
      try {
        const check = copy.pragma("integrity_check", { simple: true });
        if (check !== "ok")
          throw new CommandError(
            "BACKUP_CORRUPT",
            `BACKUP_CORRUPT: ${String(check)}`,
          );
        if (
          JSON.stringify(tableCounts(copy)) !== JSON.stringify(tableCounts(db))
        ) {
          throw new CommandError(
            "BACKUP_MISMATCH",
            "BACKUP_MISMATCH: row counts differ",
          );
        }
      } catch (e) {
        return Promise.reject(asRust(e));
      } finally {
        copy.close();
      }
      return Promise.resolve(dest);
    },
  };
}
