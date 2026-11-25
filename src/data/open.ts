// The app's database opener: open, migrate and seed (#465, moved from the portfolio
// store). The store calls it from `init` unless a test injects its own opener.
import type { Sql } from "./sql";
import { migrate } from "./migrations";
import { seedIfEmpty } from "./seed";
import { isTauri } from "../lib/tauri";

/** Open + migrate + seed the database. Normally the on-disk Tauri SQLite; lazy so
 *  non-Tauri code paths (e.g. tests) can inject their own opener instead. When running
 *  outside Tauri with the VITE_E2E flag set, it falls back to an in-memory sql.js DB so
 *  the app can boot in a plain browser for the Playwright smoke test (never shipped). */
export async function defaultOpen(): Promise<Sql> {
  const inTauri = isTauri();
  // `import.meta.env.DEV` is a build-time literal — `false` in production builds — so this
  // whole branch (and the sql.js + wasm chunk it imports) is dead-code-eliminated from the
  // shipped bundle. The browser fallback exists only for the Playwright E2E (run via the
  // dev server with VITE_E2E=1); production always uses the Tauri SQLite adapter.
  if (import.meta.env.DEV && !inTauri && import.meta.env.VITE_E2E === "1") {
    const { openBrowserSql } = await import("../e2e/browserSql");
    // ux:capture forces a startup failure to capture its screen (ADR 0153).
    const faults = await import("../e2e/e2eFaults");
    const fault = faults.e2eFault();
    const sql = await openBrowserSql();
    await faults.beforeMigrate(sql, fault);
    await migrate(sql);
    await seedIfEmpty(sql);
    await faults.afterSeed(sql, fault);
    return sql;
  }
  const { openTauriSql } = await import("./tauriSql");
  const sql = await openTauriSql();
  await migrate(sql);
  await seedIfEmpty(sql);
  return sql;
}
