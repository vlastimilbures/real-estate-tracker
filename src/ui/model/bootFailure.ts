// What the startup error screen offers for each failure (#115, ADR 0153). Try again only
// where a retry can succeed; details are "records involved" only when they are records.
import type { DataErrorCode, UpgradeStop } from "../../data/errors";

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
  "MIGRATION_CONFLICT",
]);

const RECORDS = new Set<DataErrorCode>([
  "MIGRATION_CONFLICT",
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
