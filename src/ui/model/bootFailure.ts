// What the startup error screen offers for each failure (#115, ADR 0153). Try again only
// where a retry can succeed; details are "records involved" only when they are records.
import type { DataErrorCode, UpgradeStop } from "../../data/errors";

export interface BootView {
  /** Show Try again and the retry hint: the failure may not happen again. */
  retry: boolean;
  /** The details are records (rows, names); otherwise versions, checks or driver text. */
  records: boolean;
  /** Offer Restore a backup…: only where the database opened and migrated to head, and
   *  only reading it failed. SCENARIO_INVALID no longer stops startup (ADR 0123). */
  restore: boolean;
}

/** Failures that repeat on every start, so Try again cannot help. */
const LASTING = new Set<DataErrorCode>([
  "DB_INTEGRITY",
  "DB_NEWER",
  "MIGRATION_CONFLICT",
  "ROW_INVALID",
]);

const RECORDS = new Set<DataErrorCode>([
  "MIGRATION_CONFLICT",
  "ROW_INVALID",
  "ROW_MISSING",
  "SCENARIO_INVALID",
]);

/** `null` is a failure without a typed code (the driver, the disk). */
export function bootView(code: DataErrorCode | null): BootView {
  return {
    retry: code === null || !LASTING.has(code),
    records: code !== null && RECORDS.has(code),
    restore: code === "ROW_INVALID",
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
