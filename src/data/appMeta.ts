// The app's own state in `app_meta`: every key the app writes there, with its
// readers and writers. App state, so never part of a backup or a restore (ADR 0110).
import type { Sql, SqlStatement } from "./sql";
import type { Portfolio } from "../engine";

/** Set once the first-run sample was seeded (ADR 0016): an empty portfolio then stays
 *  empty. */
export const SAMPLE_SEEDED = "sample_seeded";

/** The first-run sample portfolio (ADR 0094): its properties as seeded and the `app_meta`
 *  keys that mark it as active and its banner as dismissed. A property is part of the
 *  sample only while both its id and its name are the seeded ones (ADR 0127). */
export const SAMPLE_PROPERTIES = [
  { id: "javorova", name: "Byt Javorova" },
  { id: "lipova", name: "Byt Lipova" },
  { id: "dubova", name: "Byt Dubova" },
] as const;
export const SAMPLE_ACTIVE = "sample_active";
export const SAMPLE_DISMISSED = "sample_banner_dismissed";

/** Backup recency (ADR 0110): the last recorded export and whether the data changed
 *  since. */
export const LAST_BACKUP_AT = "last_backup_at";
export const LAST_BACKUP_FILE = "last_backup_file";
export const CHANGED_SINCE_BACKUP = "changed_since_backup";

// --- writers -------------------------------------------------------------------

/** Sets the `app_meta` flag `key` (value '1'); a flag already set stays. */
export const flagStatement = (key: string): SqlStatement => ({
  query: "INSERT OR IGNORE INTO app_meta (key, value) VALUES (?, '1')",
  params: [key],
});

/** Removes the `app_meta` key `key`. */
export const clearKeyStatement = (key: string): SqlStatement => ({
  query: "DELETE FROM app_meta WHERE key = ?",
  params: [key],
});

/** Sets the flag `key` on its own (not part of a larger write). */
export async function setFlag(sql: Sql, key: string): Promise<void> {
  const { query, params } = flagStatement(key);
  await sql.execute(query, params);
}

/** Removes both sample markers: Clear sample (ADR 0094) and every restore (ADR 0127). */
export const DELETE_SAMPLE_MARKERS: SqlStatement = {
  query: "DELETE FROM app_meta WHERE key IN (?, ?)",
  params: [SAMPLE_ACTIVE, SAMPLE_DISMISSED],
};

/** Record a successful export (ADR 0110): `at` comes from the caller, never the clock.
 *  `clearChanged: false` keeps the changed flag, for a write that landed after the
 *  exported snapshot was read. */
export async function recordBackup(
  sql: Sql,
  at: string,
  file: string,
  clearChanged = true,
): Promise<void> {
  const upsert =
    "INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value";
  await sql.transaction([
    { query: upsert, params: [LAST_BACKUP_AT, at] },
    { query: upsert, params: [LAST_BACKUP_FILE, file] },
    ...(clearChanged ? [clearKeyStatement(CHANGED_SINCE_BACKUP)] : []),
  ]);
}

/** Mark the data as changed since the last backup (ADR 0110). */
export const markDataChanged = (sql: Sql): Promise<void> =>
  setFlag(sql, CHANGED_SINCE_BACKUP);

// --- readers -------------------------------------------------------------------

/** Whether the flag `key` is set. */
export async function hasFlag(sql: Sql, key: string): Promise<boolean> {
  const rows = await sql.select<{ key: string }>(
    "SELECT key FROM app_meta WHERE key = ?",
    [key],
  );
  return rows.length > 0;
}

/** The sample markers, for `toSample` (read in the load snapshot). */
export const SAMPLE_META_QUERY: SqlStatement = {
  query: "SELECT key FROM app_meta WHERE key IN (?, ?)",
  params: [SAMPLE_ACTIVE, SAMPLE_DISMISSED],
};

/** The backup recency keys, for `toBackupState` (read in the load snapshot). */
export const BACKUP_META_QUERY: SqlStatement = {
  query: "SELECT key, value FROM app_meta WHERE key IN (?, ?, ?)",
  params: [LAST_BACKUP_AT, LAST_BACKUP_FILE, CHANGED_SINCE_BACKUP],
};

const isSampleProperty = (p: { id: string; name: string }) =>
  SAMPLE_PROPERTIES.some((s) => s.id === p.id && s.name === p.name);

/** Whether the sample is still in place (marker set and at least one sample property
 *  left) and whether its banner was dismissed (ADR 0094). */
export interface SampleState {
  active: boolean;
  dismissed: boolean;
}

export function toSample(keys: unknown[], portfolio: Portfolio): SampleState {
  const set = new Set((keys as { key: string }[]).map((r) => r.key));
  return {
    active:
      set.has(SAMPLE_ACTIVE) && portfolio.properties.some(isSampleProperty),
    dismissed: set.has(SAMPLE_DISMISSED),
  };
}

export interface BackupState {
  /** ISO UTC timestamp of the last successful export, or null. */
  lastAt: string | null;
  /** Its file name (no path), or null. */
  lastFile: string | null;
  changedSince: boolean;
}

export function toBackupState(rows: unknown[]): BackupState {
  const meta = new Map(
    (rows as { key: string; value: string }[]).map((r) => [r.key, r.value]),
  );
  return {
    lastAt: meta.get(LAST_BACKUP_AT) ?? null,
    lastFile: meta.get(LAST_BACKUP_FILE) ?? null,
    changedSince: meta.has(CHANGED_SINCE_BACKUP),
  };
}
