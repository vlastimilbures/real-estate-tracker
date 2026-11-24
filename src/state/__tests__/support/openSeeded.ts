// Shared helpers for the portfolio store tests (split from portfolioStore.test.ts, #465).
import { openMemorySql } from "../../../data/__tests__/betterSqlite";
import { migrate } from "../../../data/migrations";
import { seedIfEmpty } from "../../../data/seed";
import type { Sql } from "../../../data/sql";
import type { WriteError } from "../../writeError";

/** The underlying text of an untyped failure (kind "other"); "" for typed ones. */
export const text = (e: WriteError | null) =>
  e?.kind === "other" ? e.message : "";

/** A fresh, migrated + seeded in-memory DB — the same recipe as the app's defaultOpen. */
export async function openSeeded(): Promise<Sql> {
  const sql = openMemorySql();
  await migrate(sql);
  await seedIfEmpty(sql);
  return sql;
}
