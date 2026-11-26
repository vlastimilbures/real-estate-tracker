// The restore flow and the data-folder button, shared by Settings → Backup and the
// startup error screen: each screen says only where its failures and successes show.
import { useState } from "react";
import { chooseRestoreFile, type PickedBackup } from "../../state/backup";
import { logFailure } from "../../state/diagnostics";
import { revealDataDir } from "../../state/platform";

type Outcome<T, E> = { ok: true; value: T } | { ok: false; error: E };

/** Where a screen shows the restore flow's steps. */
export interface RestoreFlowOptions<T, E> {
  /** The screen's restore flag and its setter (a plain state or a busy-focus pair). */
  busy: readonly [boolean, (on: boolean) => void];
  /** Forget the last failure: before a pick and before a restore. */
  clearFailure: () => void;
  /** The pick failed: the file could not be read or was refused. */
  pickFailed: (e: unknown) => void;
  restore: (backup: PickedBackup["backup"]) => Promise<Outcome<T, E>>;
  /** The restore committed; the confirm has closed. */
  restored: (value: T) => void;
  /** The restore failed before its commit, so the data is unchanged; the confirm stays. */
  restoreFailed: (error: E) => void;
}

/** Pick a backup, confirm it, restore it (ADR 0148, 0153). */
export function useRestoreFlow<T, E>(o: RestoreFlowOptions<T, E>) {
  const [pending, setPending] = useState<PickedBackup | null>(null);
  const [restoring, setRestoring] = o.busy;

  async function choose() {
    o.clearFailure();
    try {
      const picked = await chooseRestoreFile();
      if (picked) setPending(picked);
    } catch (e) {
      o.pickFailed(e);
    }
  }

  async function confirm() {
    if (!pending) return;
    setRestoring(true);
    o.clearFailure();
    try {
      const result = await o.restore(pending.backup);
      if (result.ok) {
        setPending(null);
        o.restored(result.value);
      } else o.restoreFailed(result.error);
    } finally {
      setRestoring(false);
    }
  }

  return {
    pending,
    restoring,
    choose,
    confirm,
    cancel: () => setPending(null),
  };
}

/** Show the app folder in Finder (ADR 0153 §4): `clearFailure` first, and a failure is
 *  logged under REVEAL, then shown through `failed`. */
export function useRevealDataFolder(
  clearFailure: () => void,
  failed: (e: unknown) => void,
) {
  return async function showFolder() {
    clearFailure();
    try {
      await revealDataDir();
    } catch (e) {
      logFailure("REVEAL", e);
      failed(e);
    }
  };
}
