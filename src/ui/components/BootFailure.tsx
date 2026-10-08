// The startup error screen (UX-057, DR-086; #115, ADR 0153). Says what happened, honestly
// (a stopped upgrade may have changed the database), and offers only what can help:
// Try again for a failure that may not repeat, Restore a backup… where the database is
// at head and only reading it failed, and the data folder for every one.
import { useState } from "react";
import {
  usePortfolioStore,
  type StartupError,
} from "../../state/portfolioStore";
import { revealDataDir } from "../../state/platform";
import { useUiStore } from "../../state/uiStore";
import { logFailure } from "../../state/diagnostics";
import type { Dictionary } from "../../i18n";
import { useT } from "../hooks/useT";
import { Button } from "./primitives";
import { describeWriteError } from "../model/writeError";
import { chooseRestoreFile, type PickedBackup } from "../../state/backup";
import { IssueTable, RestoreConfirm } from "./RestoreConfirm";
import { backupFailure } from "./restoreFailure";
import { bootView, fileName, isPartial } from "../model/bootFailure";

/** The message, then what the upgrade left behind or the next step, if any. */
function startupText(t: Dictionary, e: StartupError): string[] {
  const u = e.upgrade;
  if (u && isPartial(u)) {
    // A brand-new database: no previous version, no data, so no copy to name.
    if (u.from === 0) return [t.boot.partialNew(u.reached, u.stoppedAt)];
    const stopped =
      e.code === "MIGRATION_CONFLICT"
        ? t.boot.partialConflict(u.reached, u.stoppedAt)
        : t.boot.partialFailed(u.reached, u.stoppedAt);
    // An existing database is copied before its first step, so the path is set here.
    return u.backupPath
      ? [stopped, t.boot.copyAt(fileName(u.backupPath))]
      : [stopped];
  }
  const next =
    e.code === "DB_INTEGRITY"
      ? t.boot.nextIntegrity
      : e.code === "ROW_INVALID"
        ? t.boot.nextRowInvalid
        : null;
  return next ? [t.dataErrors[e.code], next] : [t.dataErrors[e.code]];
}

export function BootFailure() {
  const t = useT();
  const startupError = usePortfolioStore((s) => s.startupError);
  const error = usePortfolioStore((s) => s.error);
  const init = usePortfolioStore((s) => s.init);
  const restoreAtStartup = usePortfolioStore((s) => s.restoreAtStartup);
  const continueAfterRestore = usePortfolioStore((s) => s.continueAfterRestore);
  const dataReplaced = useUiStore((s) => s.dataReplaced);
  const setNotice = useUiStore((s) => s.setNotice);
  const [revealFailed, setRevealFailed] = useState(false);
  const [pending, setPending] = useState<PickedBackup | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [failure, setFailure] = useState<ReturnType<
    typeof backupFailure
  > | null>(null);
  // A restore done here before a Try again that failed: the screen is new, but the
  // safety copy is still named (ADR 0154).
  const [restored, setRestored] = useState<{
    file: string;
    ready: boolean;
  } | null>(() => {
    const carried = useUiStore.getState().notice;
    return carried?.kind === "restored"
      ? { file: carried.file, ready: false }
      : null;
  });
  const view = bootView(startupError?.code ?? null);

  async function showFolder() {
    setRevealFailed(false);
    try {
      await revealDataDir();
    } catch (e) {
      logFailure("REVEAL", e);
      setRevealFailed(true);
    }
  }

  async function chooseBackup() {
    setFailure(null);
    try {
      const picked = await chooseRestoreFile();
      if (picked) setPending(picked);
    } catch (e) {
      setFailure(backupFailure(t, e, "RESTORE", t.backup.errInvalid));
    }
  }

  async function confirmRestore() {
    if (!pending) return;
    setRestoring(true);
    setFailure(null);
    try {
      const { safetyBackup, ready } = await restoreAtStartup(pending.backup);
      setPending(null);
      setRestored({ file: safetyBackup, ready });
    } catch (e) {
      // One transaction: a failure before the commit leaves the data as it was.
      setFailure(backupFailure(t, e, "RESTORE", t.backup.restoreFailed));
    } finally {
      setRestoring(false);
    }
  }

  /** Leave the screen: the app keeps naming the safety copy until dismissed (ADR 0154). */
  function leave(file: string, go: () => void) {
    dataReplaced();
    setNotice({ kind: "restored", file });
    go();
  }

  const folderButton = (
    <Button onClick={() => void showFolder()}>{t.boot.showDataFolder}</Button>
  );

  // After a restore the failure above no longer applies: name the safety copy, then go
  // on into the app (or, when the restored data cannot be loaded either, try again).
  if (restored)
    return (
      <div className="error-screen" role="alert">
        <p>
          {restored.ready
            ? t.backup.restored(restored.file)
            : t.boot.restoredReloadFailed(restored.file)}
        </p>
        {revealFailed && <p className="error-text">{t.boot.revealFailed}</p>}
        <div className="row" style={{ gap: "var(--s3)" }}>
          {restored.ready ? (
            <Button
              variant="primary"
              onClick={() => leave(restored.file, continueAfterRestore)}
            >
              {t.boot.continue}
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={() => leave(restored.file, () => void init())}
            >
              {t.app.tryAgain}
            </Button>
          )}
          {folderButton}
        </div>
      </div>
    );

  return (
    <div className="error-screen" role="alert">
      <span className="eyebrow">{t.app.dbErrorEyebrow}</span>
      {startupError ? (
        <>
          {startupText(t, startupError).map((line) => (
            <p key={line}>{line}</p>
          ))}
          {startupError.details.length > 0 && (
            <div className="error-screen-details">
              <span>
                {view.records
                  ? t.dataErrors.detailsHeading
                  : t.boot.detailsOther}
              </span>
              <ul>
                {startupError.details.map((d) => (
                  <li key={d}>
                    <code>{d}</code>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        error && <code>{describeWriteError(t, error).message}</code>
      )}
      {view.retry && <p>{t.app.bootRetryHint}</p>}
      <small>{t.dataErrors.logHint}</small>
      {revealFailed && <p className="error-text">{t.boot.revealFailed}</p>}
      {failure && (
        <div>
          <p className="error-text">{failure.text}</p>
          {failure.issues.length > 0 && <IssueTable issues={failure.issues} />}
        </div>
      )}
      {pending ? (
        <RestoreConfirm
          pending={pending}
          restoring={restoring}
          onCancel={() => setPending(null)}
          onConfirm={() => void confirmRestore()}
        />
      ) : (
        <div className="row" style={{ gap: "var(--s3)" }}>
          {view.retry && (
            <Button variant="primary" onClick={() => void init()}>
              {t.app.tryAgain}
            </Button>
          )}
          {view.restore && (
            <Button variant="primary" onClick={() => void chooseBackup()}>
              {t.boot.restoreBackup}
            </Button>
          )}
          {folderButton}
        </div>
      )}
    </div>
  );
}
