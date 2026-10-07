// Forced startup failures for the browser E2E / ux:capture run (#115, ADR 0153), so the
// startup error screen can be captured. NOT a shipped code path: it is imported only in
// portfolioStore's DEV + VITE_E2E branch, which is removed from the production bundle.
// Each fault is a real one: the data layer itself then refuses the database.
import type { Sql } from "./sql";

export type E2eFault = "DB_NEWER" | "ROW_INVALID";

/** The fault the capture run asked for (`sessionStorage["e2e.fault"]`), if any. */
export function e2eFault(): E2eFault | null {
  try {
    const f = sessionStorage.getItem("e2e.fault");
    return f === "DB_NEWER" || f === "ROW_INVALID" ? f : null;
  } catch {
    return null;
  }
}

/** DB_NEWER: the database records a schema version newer than this app's. */
export async function beforeMigrate(
  sql: Sql,
  fault: E2eFault | null,
): Promise<void> {
  if (fault !== "DB_NEWER") return;
  await sql.execute(
    "CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)",
  );
  await sql.execute(
    "INSERT INTO schema_migrations (version, name, applied_at) VALUES (999, 'future', '2026-10-07T00:00:00.000Z')",
  );
}

/** ROW_INVALID: a hand-edited rent the CHECK lets through but the mapper refuses. */
export async function afterSeed(
  sql: Sql,
  fault: E2eFault | null,
): Promise<void> {
  if (fault !== "ROW_INVALID") return;
  await sql.execute(
    "UPDATE leases SET monthly_rent = 'abc' WHERE id = (SELECT id FROM leases ORDER BY id LIMIT 1)",
  );
}
