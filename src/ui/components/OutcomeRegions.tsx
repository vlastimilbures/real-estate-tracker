// Where the app reports what an action did (ADR 0154), on whichever page the owner is
// on: the safety copy a restore or Clear sample wrote and the last failure, each until
// dismissed, and the toast, whose live region is in the page before its text arrives.
import {
  useUiStore,
  type Failure,
  type Notice,
  type OutcomeAction,
} from "../../state/uiStore";
import { RestoreError } from "../../state/backup";
import { messageOf } from "../../state/diagnostics";
import type { Dictionary } from "../../i18n";
import { useT } from "../hooks/useT";
import { Button, ErrorBanner } from "./primitives";
import { IssueTable } from "./RestoreConfirm";
import { backupFailureText } from "./restoreFailure";

/** A failed action as text, translated now (the failure was logged when caught). */
function failureText(t: Dictionary, action: OutcomeAction, e: unknown): string {
  switch (action) {
    case "restore":
      return backupFailureText(t, e, t.backup.restoreFailed).text;
    case "pickBackup":
      return backupFailureText(t, e, t.backup.errInvalid).text;
    case "backupExport":
      return backupFailureText(t, e, t.backup.exportFailed).text;
    case "loadSample":
      return backupFailureText(t, e, t.sample.loadFailed).text;
    case "import":
      return backupFailureText(t, e, t.importPage.importFailed).text;
    case "xlsxExport":
      return t.xlsx.exportFailed(messageOf(e));
  }
}

function FailureView({ failure }: { failure: Failure }) {
  const t = useT();
  const dismiss = useUiStore((s) => s.dismissFailure);
  const { action, error } = failure;
  return (
    <div>
      <ErrorBanner
        message={failureText(t, action, error)}
        onDismiss={dismiss}
      />
      {error instanceof RestoreError && error.issues.length > 0 && (
        <IssueTable issues={error.issues} />
      )}
    </div>
  );
}

function NoticeView({ notice }: { notice: Notice }) {
  const t = useT();
  const dismiss = useUiStore((s) => s.dismissNotice);
  return (
    <div className="banner info" role="status">
      <span>
        {notice.kind === "restored"
          ? t.backup.restored(notice.file)
          : t.sample.cleared(notice.file)}
      </span>
      <Button size="sm" variant="ghost" onClick={dismiss}>
        {t.common.dismiss}
      </Button>
    </div>
  );
}

/** The notice and the failure (if any) and the always-present toast region, for the
 *  app shell. */
export function OutcomeRegions() {
  const notice = useUiStore((s) => s.notice);
  const failure = useUiStore((s) => s.failure);
  const toast = useUiStore((s) => s.toast);
  return (
    <>
      {failure && <FailureView failure={failure} />}
      {notice && <NoticeView notice={notice} />}
      <div
        className="toast-region"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {toast && (
          <div className="toast" key={toast.id}>
            {toast.message}
          </div>
        )}
      </div>
    </>
  );
}
