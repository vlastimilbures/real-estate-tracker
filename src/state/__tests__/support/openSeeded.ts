// Shared helpers for the portfolio store tests (split from portfolioStore.test.ts, #465).
import { openMemorySql } from "../../../data/__tests__/betterSqlite";
import { migrate } from "../../../data/migrations";
import { seedIfEmpty } from "../../../data/seed";
import type { Sql } from "../../../data/sql";
import type { WriteError } from "../../writeError";

/** The underlying text of an untyped failure (kind "other"); "" for typed ones. */
export const text = (e: WriteError | null) =>
  e?.kind === "other" ? e.message : "";

/** A fresh, migrated + seeded in-memory DB — the same recipe as the app's defaultOpen
 *  (src/data/open.ts). */
export async function openSeeded(): Promise<Sql> {
  const sql = openMemorySql();
  await migrate(sql);
  await seedIfEmpty(sql);
  return sql;
}

/** The app's launch recipe (defaultOpen, src/data/open.ts) on `db`: migrate, seed an empty
 *  database, open. Launching again on the same `db` is a relaunch over its data. */
export const launchOn =
  <T extends Sql>(db: T) =>
  async (): Promise<T> => {
    await migrate(db);
    await seedIfEmpty(db);
    return db;
  };

/** `real`, but the reload's snapshot read fails: the write commits, the reload after it
 *  fails. A snapshot that reads `schema_migrations` stands for `exportToJson` (the safety
 *  backup) and passes; every action's other reads use `select`, so only the reload is
 *  hit. */
export const reloadFails = (real: Sql): Sql => ({
  ...real,
  selectSnapshot: (statements) =>
    statements.some((s) => s.query.includes("schema_migrations"))
      ? real.selectSnapshot(statements)
      : Promise.reject(new Error("database is locked")),
});
