// The startup error screen (ADR 0153). Says what happened, honestly (a stopped upgrade
// may have changed the database), and offers only what can help: Try again for a failure
// that may not repeat, Restore a backup… where the database is at head and only reading
// it failed, and the data folder for every one. A save whose read-back failed stops here
// too, saying the change was saved (ADR 0228).
import { useState, type ReactNode } from "react";
import {
  usePortfolioStore,
  type Status,
  type StartupError,
} from "../../state/portfolioStore";
import type { RefusedWrite } from "../../state/writeTargets";
import { useUiStore, type Notice } from "../../state/uiStore";
import { READ_FAILURES } from "../../state/diagnostics";
import { APP_NAME, type Dictionary } from "../../i18n";
import { useT } from "../hooks/useT";
import { Button } from "./Button";
import { describeWriteError } from "../model/writeError";
import { IssueTable, RestoreConfirm } from "./RestoreConfirm";
import { backupFailure, backupFailureText } from "./restoreFailure";
import { useRestoreFlow, useRevealDataFolder } from "../hooks/useRestoreFlow";
import {
  bootView,
  fileName,
  isPartial,
  refusedWriteLabels,
} from "../model/bootFailure";

/** The message, then what the upgrade left behind or the next step, if any. */
function startupText(t: Dictionary, e: StartupError): string[] {
  const u = e.upgrade;
  if (u && isPartial(u)) {
    // A brand-new database: no previous version, no data, so no copy to name.
    if (u.from === 0) return [t.boot.partialNew(u.reached, u.stoppedAt)];
    const stopped = t.boot.partialFailed(u.reached, u.stoppedAt);
    // An existing database is copied before its first step, so the path is set here.
    return u.backupPath
      ? [stopped, t.boot.copyAt(fileName(u.backupPath))]
      : [stopped];
  }
  const next =
    e.code === "DB_INTEGRITY"
      ? t.boot.nextIntegrity
      : READ_FAILURES.has(e.code)
        ? t.boot.nextRowInvalid
        : null;
  return next ? [t.dataErrors[e.code], next] : [t.dataErrors[e.code]];
}

/** The safety copy a restore or Clear sample wrote, still named here (ADR 0154). */
function noticeText(t: Dictionary, notice: Notice): string {
  return notice.kind === "restored"
    ? t.backup.restored(notice.file)
    : t.sample.cleared(notice.file);
}

/** A save committed but its read-back failed: say the change was saved, name the
 *  writes queued behind it that were refused (ADR 0255), and still name the safety copy
 *  (ADR 0228, ADR 0154 §5). */
function ReadBackText({
  notice,
  refused,
}: {
  notice: Notice | null;
  refused: RefusedWrite[];
}) {
  const t = useT();
  return (
    <>
      <p>{t.boot.readBackFailed}</p>
      {refused.length > 0 && (
        <div className="error-screen-details">
          <span>{t.boot.notSaved}</span>
          <ul>
            {refusedWriteLabels(t, refused).map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </div>
      )}
      {notice && <p>{noticeText(t, notice)}</p>}
    </>
  );
}

/** A typed startup failure: its lines, then its details, headed as records when they
 *  are. */
function StartupText({
  error,
  records,
}: {
  error: StartupError;
  records: boolean;
}) {
  const t = useT();
  return (
    <>
      {startupText(t, error).map((line) => (
        <p key={line}>{line}</p>
      ))}
      {error.details.length > 0 && (
        <div className="error-screen-details">
          <span>
            {records ? t.dataErrors.detailsHeading : t.boot.detailsOther}
          </span>
          <ul>
            {error.details.map((d) => (
              <li key={d}>
                <code>{d}</code>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

/** What stopped the app: a failed read-back, a typed startup failure, or the error. */
function StopText({
  status,
  notice,
  records,
}: {
  status: Status;
  notice: Notice | null;
  records: boolean;
}) {
  const t = useT();
  if (status.kind === "readBackFailed")
    return <ReadBackText notice={notice} refused={status.refused} />;
  if (status.kind !== "startupFailed") return null;
  return status.startup ? (
    <StartupText error={status.startup} records={records} />
  ) : (
    <code>{describeWriteError(t, status.error).message}</code>
  );
}

type RestoreFlow = ReturnType<typeof useRestoreFlow>;
type Failure = ReturnType<typeof backupFailure>;

/** After a restore whose data loaded the failure no longer applies: name the safety
 *  copy, then go on into the app. The page's main landmark with an h1 (ADR 0157); the
 *  screen has no title line, so its h1 is for screen readers only. */
function RestoredAtStartupScreen({
  file,
  revealFailed,
  onContinue,
  folderButton,
}: {
  file: string;
  revealFailed: boolean;
  onContinue: () => void;
  folderButton: ReactNode;
}) {
  const t = useT();
  return (
    <main>
      <h1 className="sr-only">{APP_NAME}</h1>
      <div className="error-screen" role="alert">
        <p>{t.backup.restored(file)}</p>
        {revealFailed && <p className="error-text">{t.boot.revealFailed}</p>}
        <div className="row row-s3">
          <Button variant="primary" onClick={onContinue}>
            {t.boot.continue}
          </Button>
          {folderButton}
        </div>
      </div>
    </main>
  );
}

/** What stopped the app and what can help (ADR 0153); the page's main landmark, its h1
 *  the eyebrow (ADR 0157). */
function StartupErrorScreen({
  status,
  revealFailed,
  failure,
  restore,
  onRetry,
  folderButton,
}: {
  status: Status;
  revealFailed: boolean;
  failure: Failure | null;
  restore: RestoreFlow;
  onRetry: () => void;
  folderButton: ReactNode;
}) {
  const t = useT();
  const notice = useUiStore((s) => s.notice);
  const startupError = status.kind === "startupFailed" ? status.startup : null;
  const view = bootView(startupError?.code ?? null, READ_FAILURES);
  return (
    <main>
      <div className="error-screen" role="alert">
        <h1 className="eyebrow">{t.app.dbErrorEyebrow}</h1>
        <StopText status={status} notice={notice} records={view.records} />
        {view.retry && <p>{t.app.bootRetryHint}</p>}
        <small>{t.dataErrors.logHint}</small>
        {revealFailed && <p className="error-text">{t.boot.revealFailed}</p>}
        {failure && (
          <div>
            <p className="error-text">{failure.text}</p>
            {failure.issues.length > 0 && (
              <IssueTable issues={failure.issues} />
            )}
          </div>
        )}
        {restore.pending ? (
          <RestoreConfirm
            pending={restore.pending}
            restoring={restore.restoring}
            onCancel={restore.cancel}
            onConfirm={() => void restore.confirm()}
          />
        ) : (
          <div className="row row-s3">
            {view.retry && (
              <Button variant="primary" onClick={onRetry}>
                {t.app.tryAgain}
              </Button>
            )}
            {view.restore && (
              <Button variant="primary" onClick={() => void restore.choose()}>
                {t.boot.restoreBackup}
              </Button>
            )}
            {folderButton}
          </div>
        )}
      </div>
    </main>
  );
}

/** The startup error screen, or the screen after a restore done here whose data loaded. */
export function BootFailure() {
  const t = useT();
  const status = usePortfolioStore((s) => s.status);
  const init = usePortfolioStore((s) => s.init);
  const restoreAtStartup = usePortfolioStore((s) => s.restoreAtStartup);
  const continueAfterRestore = usePortfolioStore((s) => s.continueAfterRestore);
  const setNotice = useUiStore((s) => s.setNotice);
  const [revealFailed, setRevealFailed] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  // The safety copy of a restore done here whose data loaded, named until Continue.
  const [restored, setRestored] = useState<string | null>(null);
  const restore = useRestoreFlow({
    busy: useState(false),
    clearFailure: () => setFailure(null),
    pickFailed: (e) =>
      setFailure(
        backupFailure(t, e, "RESTORE", { other: t.backup.errInvalid }),
      ),
    restore: restoreAtStartup,
    restored: ({ safetyBackup, ready }) => {
      if (ready) setRestored(safetyBackup);
      else {
        // The data could not be read back: the read-back screen names the copy, also
        // after a Try again that fails again (ADR 0154 §5, ADR 0228).
        setNotice({ kind: "restored", file: safetyBackup });
      }
    },
    // One transaction: a failure before the commit leaves the data as it was; the store
    // logged it.
    restoreFailed: (error) =>
      setFailure(
        backupFailureText(t, error, { other: t.backup.restoreFailed }),
      ),
  });
  const showFolder = useRevealDataFolder(
    () => setRevealFailed(false),
    () => setRevealFailed(true),
  );
  const folderButton = (
    <Button onClick={() => void showFolder()}>{t.boot.showDataFolder}</Button>
  );

  if (restored)
    return (
      <RestoredAtStartupScreen
        file={restored}
        revealFailed={revealFailed}
        folderButton={folderButton}
        onContinue={() => {
          // Leave the screen: the app keeps naming the safety copy until dismissed
          // (ADR 0154).
          setNotice({ kind: "restored", file: restored });
          continueAfterRestore();
        }}
      />
    );
  return (
    <StartupErrorScreen
      status={status}
      revealFailed={revealFailed}
      failure={failure}
      restore={restore}
      onRetry={() => void init()}
      folderButton={folderButton}
    />
  );
}
