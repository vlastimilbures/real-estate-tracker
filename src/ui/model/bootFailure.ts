// What the startup error screen offers for each failure (ADR 0153). Try again only
// where a retry can succeed; details are "records involved" only when they are records.
// After a failed read-back, the writes it refused are named (ADR 0255).
import type { DataErrorCode, UpgradeStop } from "../../data/errors";
import type { Dictionary } from "../../i18n";
import type { RefusedWrite } from "../../state/writeTargets";

export interface BootView {
  /** Show Try again and the retry hint: the failure may not happen again. */
  retry: boolean;
  /** The details are records (rows, names); otherwise versions, checks or driver text. */
  records: boolean;
  /** Offer Restore a backup…: only where the database opened and migrated to head, and
   *  only reading it failed (`READ_FAILURES`, ADR 0231). */
  restore: boolean;
}

/** Failures that repeat on every start, so Try again cannot help. A read failure
 *  (`readFailures`) repeats too and is handled separately: it offers restore instead. */
const LASTING = new Set<DataErrorCode>([
  "DB_INTEGRITY",
  "DB_NEWER",
  "DB_TOO_OLD",
]);

const RECORDS = new Set<DataErrorCode>([
  "ROW_INVALID",
  "ROW_MISSING",
  "SCENARIO_INVALID",
]);

/** `null` is a failure without a typed code (the driver, the disk). `readFailures` is
 *  `READ_FAILURES` from the data layer, passed in to keep this model pure (ADR 0072). */
export function bootView(
  code: DataErrorCode | null,
  readFailures: ReadonlySet<DataErrorCode>,
): BootView {
  const read = code !== null && readFailures.has(code);
  return {
    retry: code === null || (!LASTING.has(code) && !read),
    records: code !== null && RECORDS.has(code),
    restore: read,
  };
}

/** Some steps committed before the upgrade stopped, so the database has changed. */
export function isPartial(upgrade: UpgradeStop | undefined): boolean {
  return upgrade !== undefined && upgrade.reached !== upgrade.from;
}

/** The last part of a path, for naming a file in the backups folder. */
export function fileName(path: string): string {
  return path.split("/").pop() ?? path;
}

/** The names of the writes refused after a failed read-back, in order, from existing
 *  dictionary entries: a table as the restore confirm lists it, an action by its button
 *  or title (ADR 0255). */
export function refusedWriteLabels(
  t: Dictionary,
  refused: readonly RefusedWrite[],
): string[] {
  const names: Record<RefusedWrite, string> = {
    ...t.backup.tables,
    importCsv: t.common.importCsv,
    restore: t.backup.restoreTitle,
    clearSample: t.sample.confirm,
    loadSample: t.sample.loadAction,
  };
  return refused.map((r) => names[r]);
}
