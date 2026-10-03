// Node/Vitest `Sql` adapter backed by better-sqlite3 (in-memory by default). This is
// the TEST seam only — the shipped app uses tauriSql.ts. better-sqlite3 is a
// devDependency; importing it here keeps it out of the app bundle.
//
// The driver is synchronous; we wrap each call in a resolved Promise to satisfy the
// async `Sql` interface. Positional `?` parameters map 1:1 to better-sqlite3.
// `transaction` and `backup` mirror src-tauri/src/db.rs (D-14): same FK-off rebuild
// rule, same verification of the copy, same error-code prefixes.
import DatabaseConstructor from "better-sqlite3";
import type { Database } from "better-sqlite3";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  ExecuteResult,
  Sql,
  SqlStatement,
  TransactionOptions,
} from "../sql";

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
      const { changes } = db.prepare(query).run(...(params as never[]));
      return { rowsAffected: changes };
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
        return Promise.reject(e instanceof Error ? e : new Error(String(e)));
      }
    },
    transaction(
      statements: SqlStatement[],
      options: TransactionOptions = {},
    ): Promise<void> {
      const fkOff = options.foreignKeysOff ?? false;
      if (fkOff) db.pragma("foreign_keys = OFF");
      try {
        db.transaction(() => {
          for (const s of statements) {
            // A parameterless text may hold several statements (a migration, DR-084).
            if (s.params?.length)
              db.prepare(s.query).run(...(s.params as never[]));
            else db.exec(s.query);
          }
          if (fkOff) {
            const broken = db.pragma("foreign_key_check") as unknown[];
            if (broken.length > 0) {
              throw new Error(
                `FOREIGN_KEY_CHECK_FAILED: ${broken.length} row(s)`,
              );
            }
          }
        })();
        return Promise.resolve();
      } catch (e) {
        return Promise.reject(e instanceof Error ? e : new Error(String(e)));
      } finally {
        if (fkOff) db.pragma("foreign_keys = ON");
      }
    },
    backup(label: string): Promise<string> {
      if (!/^[A-Za-z0-9-]{1,100}$/.test(label)) {
        return Promise.reject(new Error(`invalid backup label: ${label}`));
      }
      backupDir ??= mkdtempSync(join(tmpdir(), "ret-test-backup-"));
      const dest = join(backupDir, `${label}.sqlite`);
      if (existsSync(dest)) {
        return Promise.reject(new Error(`BACKUP_EXISTS: ${dest}`));
      }
      db.prepare("VACUUM INTO ?").run(dest);
      const copy = new DatabaseConstructor(dest, { readonly: true });
      try {
        const check = copy.pragma("integrity_check", { simple: true });
        if (check !== "ok") throw new Error(`BACKUP_CORRUPT: ${String(check)}`);
        if (
          JSON.stringify(tableCounts(copy)) !== JSON.stringify(tableCounts(db))
        ) {
          throw new Error("BACKUP_MISMATCH: row counts differ");
        }
      } catch (e) {
        return Promise.reject(e instanceof Error ? e : new Error(String(e)));
      } finally {
        copy.close();
      }
      return Promise.resolve(dest);
    },
  };
}
